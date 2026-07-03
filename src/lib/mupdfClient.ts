import * as Comlink from "comlink";
import type { MupdfWorkerApi } from "@/workers/mupdf.worker";
import { retrieveDoc } from "./pdfStore";
import type { PageRef, PdfMetadata, ExtractedImage, ImagePosition, BatesConfig, CompressConfig, OutlineEntry } from "./types";
import type { ImageProcessConfig } from "./imageResize";
import type { ContrastConfig } from "./contrast";
import type { HtmlLayoutOptions } from "./htmlToPdf";

let worker: Comlink.Remote<MupdfWorkerApi> | null = null;

function getWorker(): Comlink.Remote<MupdfWorkerApi> {
  if (worker) return worker;
  const raw = new Worker(
    new URL("../workers/mupdf.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker = Comlink.wrap<MupdfWorkerApi>(raw);
  return worker;
}

// LRU cache for worker document handles, capped by both handle count and
// total resident bytes. An open document keeps (at least) its full file bytes
// in MuPDF's WASM heap, and that heap only ever grows — so the byte cap is
// what actually bounds peak memory; the count cap keeps pathological
// many-tiny-docs sessions in check. Re-opening an evicted document is an
// OPFS read + parse (typically a few milliseconds).
const MAX_HANDLES = 20;
const MAX_RESIDENT_BYTES = 512 * 1024 * 1024;
const handles = new Map<string, { handle: number; bytes: number }>(); // insertion-order = LRU order
let residentBytes = 0;

// Coalesces concurrent loads of the same document. Without this, two
// components mounting at once (e.g. a stack card and its expansion box, both
// thumbnailing the same doc) would each miss the cache and open the document
// twice — the second handle overwrites the first in `handles`, and the first
// is never released.
const loading = new Map<string, Promise<number>>();

// Tracks in-flight worker ops per docId so `releaseDocument` can defer
// destroying the MuPDF doc until pending calls have settled. Without this,
// `releaseDocument(handle)` queued between two awaits (e.g. between
// getPageCount and extractImages in extractImagesFromDocument) gets processed
// by the worker before the second call, and the second call's getDoc(handle)
// throws "No document for handle N".
const inFlightOps = new Map<string, Set<Promise<unknown>>>();
const docMagic = new Map<string, string>();

export function setDocMagic(docId: string, magic: string): void {
  docMagic.set(docId, magic);
}

function trackOp<T>(docId: string, p: Promise<T>): Promise<T> {
  let set = inFlightOps.get(docId);
  if (!set) {
    set = new Set();
    inFlightOps.set(docId, set);
  }
  set.add(p);
  p.finally(() => {
    const current = inFlightOps.get(docId);
    if (!current) return;
    current.delete(p);
    if (current.size === 0) inFlightOps.delete(docId);
  });
  return p;
}

async function ensureLoaded(docId: string): Promise<number> {
  const existing = handles.get(docId);
  if (existing !== undefined) {
    // Move to end (most-recently-used) by re-inserting
    handles.delete(docId);
    handles.set(docId, existing);
    return existing.handle;
  }

  const inFlight = loading.get(docId);
  if (inFlight) return inFlight;

  const load = (async () => {
    const data = await retrieveDoc(docId);
    if (!data) throw new Error(`No document data for ${docId}`);

    // Evict least-recently-used handles until both caps are satisfied. Skip
    // docs with in-flight ops — destroying them mid-call would break the
    // worker call. If everything is in-flight (rare), proceed without
    // evicting and let the caps drift.
    for (const [candidate, entry] of handles) {
      const overCount = handles.size >= MAX_HANDLES;
      const overBytes = residentBytes + data.byteLength > MAX_RESIDENT_BYTES;
      if (!overCount && !overBytes) break;
      if (inFlightOps.has(candidate)) continue;
      handles.delete(candidate);
      residentBytes -= entry.bytes;
      getWorker().releaseDocument(entry.handle);
    }

    const bytes = data.byteLength;
    const w = getWorker();
    const handle = await w.openDocument(Comlink.transfer(data, [data]), docMagic.get(docId));
    handles.set(docId, { handle, bytes });
    residentBytes += bytes;
    return handle;
  })();

  loading.set(docId, load);
  try {
    return await load;
  } finally {
    loading.delete(docId);
  }
}

export async function loadDocument(docId: string): Promise<void> {
  return trackOp(docId, (async () => {
    await ensureLoaded(docId);
  })());
}

export async function getPageCount(docId: string): Promise<number> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().getPageCount(handle);
  })());
}

/**
 * Renders a page as ImageData for direct canvas painting.
 * pageIndex is 0-based. Rotation is applied at render time.
 */
export async function renderPage(
  docId: string,
  pageIndex: number,
  scale: number,
  rotation: number = 0
): Promise<ImageData> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const dpi = scale * 72;
    return getWorker().renderPage(handle, pageIndex, dpi, rotation);
  })());
}

/**
 * Renders a page as a Blob URL for thumbnail display.
 * pageIndex is 0-based. width is the desired pixel width.
 */
export async function renderThumbnail(
  docId: string,
  pageIndex: number,
  width: number,
  rotation: number = 0
): Promise<{ blobUrl: string; aspectRatio: number }> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const { pngData, aspectRatio } = await getWorker().renderThumbnail(
      handle,
      pageIndex,
      width,
      dpr,
      rotation
    );
    const blob = new Blob([pngData as BlobPart], { type: "image/png" });
    const blobUrl = URL.createObjectURL(blob);
    return { blobUrl, aspectRatio };
  })());
}

export async function releaseDocument(docId: string): Promise<void> {
  // Wait for any in-flight worker calls on this doc to settle. Otherwise the
  // worker may process releaseDocument between two queued calls and the second
  // call's getDoc(handle) throws "No document for handle N".
  const pending = inFlightOps.get(docId);
  if (pending && pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
  const entry = handles.get(docId);
  if (entry !== undefined) {
    getWorker().releaseDocument(entry.handle);
    handles.delete(docId);
    residentBytes -= entry.bytes;
  }
  docMagic.delete(docId);
}

/**
 * Extract embedded images from a single page.
 * JPEG/JP2 images come out in their original bytes with color profiles;
 * other image data is decoded and re-encoded as PNG.
 */
export async function extractImagesFromPage(
  docId: string,
  pageIndex: number
): Promise<ExtractedImage[]> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const result = await getWorker().extractImages(handle, [pageIndex]);
    return result.images as ExtractedImage[];
  })());
}

/** Extract embedded images from all pages of a document. */
export async function extractImagesFromDocument(
  docId: string
): Promise<ExtractedImage[]> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const count = await getWorker().getPageCount(handle);
    const indices = Array.from({ length: count }, (_, i) => i);
    const result = await getWorker().extractImages(handle, indices);
    return result.images as ExtractedImage[];
  })());
}

/** Get canvas-pixel positions of images on a page for hit-testing. */
export async function getImagePositions(
  docId: string,
  pageIndex: number,
  scale: number,
  rotation: number = 0
): Promise<ImagePosition[]> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const dpi = scale * 72;
    return getWorker().getImagePositions(handle, pageIndex, dpi, rotation) as Promise<ImagePosition[]>;
  })());
}

/** Extract a single image by on-page index (matches getImagePositions ordering). Always PNG. */
export async function extractSingleImage(
  docId: string,
  pageIndex: number,
  imageIndex: number
): Promise<{ width: number; height: number; data: Uint8Array; mimeType: string; extension: string } | null> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().extractSingleImage(handle, pageIndex, imageIndex);
  })());
}

/** Apply Bates numbering to all pages of a document. */
export async function applyBatesStamp(
  docId: string,
  config: BatesConfig & { startNumber: number }
): Promise<Uint8Array> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().applyBatesStamp(handle, config);
  })());
}

/** Render a single page with Bates stamp for preview. */
export async function renderBatesPreview(
  docId: string,
  pageIndex: number,
  config: BatesConfig & { startNumber: number },
  dpi: number = 144
): Promise<ImageData> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().renderBatesPreview(handle, pageIndex, config, dpi);
  })());
}

/** Compress a PDF — recompresses images as JPEG and re-saves with garbage collection / sanitization. */
export async function compressPdf(
  docId: string,
  config: CompressConfig
): Promise<Uint8Array> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().compressPdf(handle, config);
  })());
}

/** Render a single page as it would appear after compression, for preview. */
export async function renderCompressedPreview(
  docId: string,
  pageIndex: number,
  config: CompressConfig,
  dpi: number = 144
): Promise<ImageData> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().renderCompressedPreview(handle, pageIndex, config, dpi);
  })());
}

/** Encrypt a PDF with a password (used for both user and owner password). */
export async function encryptPdf(
  docId: string,
  password: string
): Promise<Uint8Array> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().encryptPdf(handle, password);
  })());
}

/** Whether the document needs a password to read its pages. */
export async function needsPassword(docId: string): Promise<boolean> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().needsPassword(handle);
  })());
}

/** Authenticate the document with a password. Returns true on success. */
export async function authenticatePassword(
  docId: string,
  password: string
): Promise<boolean> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().authenticatePassword(handle, password);
  })());
}

/** Save the document with encryption removed. Document must be authenticated first. */
export async function decryptPdf(docId: string): Promise<Uint8Array> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    return getWorker().decryptPdf(handle);
  })());
}

/** Per-page image encoding for the contrast export. */
export type ContrastPageEncoding =
  | { format: "png" }
  | { format: "jpeg"; quality: number };

export interface ContrastExportBuilder {
  /** Render, filter, encode, and append one source page to the build. */
  addPage(
    docId: string,
    pageIndex: number,
    dpi: number,
    config: ContrastConfig,
    encoding: ContrastPageEncoding
  ): Promise<void>;
  /** Save the finished PDF and discard the build. */
  finish(): Promise<Uint8Array>;
  /** Discard the build. Safe to call unconditionally, even after finish(). */
  abort(): Promise<void>;
}

/**
 * Incrementally build a PDF whose pages are rasterized, contrast-filtered
 * images of a document's pages. Used by the contrast wizard's export.
 *
 * Rendering, filtering, and encoding all happen inside the worker, one page
 * per addPage call — no pixel data crosses the worker boundary and the main
 * thread never holds more than control messages, so peak memory stays flat
 * no matter how many pages the document has. Each addPage is tracked against
 * the source doc so it can't be evicted or released mid-export.
 */
export function beginContrastExport(): ContrastExportBuilder {
  const buildId = getWorker().imagePdfBegin();
  return {
    addPage: (docId, pageIndex, dpi, config, encoding) =>
      trackOp(docId, (async () => {
        const handle = await ensureLoaded(docId);
        return getWorker().imagePdfAddContrastPage(
          await buildId,
          handle,
          pageIndex,
          dpi,
          config,
          encoding
        );
      })()),
    finish: async () => getWorker().imagePdfFinish(await buildId),
    abort: async () => getWorker().imagePdfAbort(await buildId),
  };
}

/** Load the document outline (bookmarks) as a flat list with page ranges. */
export async function loadOutline(
  docId: string
): Promise<OutlineEntry[] | null> {
  return trackOp(docId, (async () => {
    const handle = await ensureLoaded(docId);
    const result = await getWorker().loadOutline(handle);
    return (result as OutlineEntry[] | null);
  })());
}

/** Merge pages into a single PDF using document handles for resource deduplication.
 *
 * `imageProcessByDocId` lets the caller pass an `ImageProcessConfig` for
 * specific image-derived source documents. Pages from those docs get rebuilt
 * (resize + recompress) instead of grafted as-is.
 */
export async function mergePdfs(
  pageRefs: PageRef[],
  metadata?: PdfMetadata,
  imageProcessByDocId?: Map<string, ImageProcessConfig>
): Promise<Uint8Array> {
  const uniqueDocIds = [...new Set(pageRefs.map((p) => p.sourceDocId))];

  // Pin every source doc for the whole merge span. Loading handles below can
  // trigger LRU evictions, and a doc without an in-flight op is fair game —
  // so with more unique sources than the handle cap, doc #1 would be evicted
  // before mergeFromHandles ever ran and the merge would fail with "No
  // document for handle N". The pin also makes a concurrent releaseDocument
  // on any source wait until the merge settles.
  let unpin!: () => void;
  const pin = new Promise<void>((resolve) => {
    unpin = resolve;
  });
  for (const docId of uniqueDocIds) void trackOp(docId, pin);

  try {
    // Ensure all unique source documents are loaded
    const handleMap = new Map<string, number>();
    for (const docId of uniqueDocIds) {
      handleMap.set(docId, await ensureLoaded(docId));
    }

    // Build page specs using handles
    const pageSpecs = pageRefs.map((p) => ({
      handle: handleMap.get(p.sourceDocId)!,
      pageIndex: p.sourcePageIndex,
      rotation: p.rotation,
      imageProcess: imageProcessByDocId?.get(p.sourceDocId),
    }));

    return await getWorker().mergeFromHandles(pageSpecs, metadata);
  } finally {
    unpin();
  }
}

// HTML → PDF conversion. Both calls are stateless — the worker opens and
// destroys the HTML document per call, nothing enters the handle LRU — so
// there is no docId to track. The HTML string stays the main thread's source
// of truth; each call encodes a fresh buffer because transferring detaches it.

/** Lay out HTML and render one page (content + margins) for the live preview. */
export async function renderHtmlPreview(
  html: string,
  options: HtmlLayoutOptions,
  pageIndex: number,
  targetWidthPx: number
): Promise<{ pageCount: number; imageData: ImageData }> {
  const buf = new TextEncoder().encode(html).buffer as ArrayBuffer;
  return getWorker().renderHtmlPreview(
    Comlink.transfer(buf, [buf]),
    options,
    pageIndex,
    targetWidthPx
  );
}

/** Convert HTML to a text-based PDF, keeping hyperlinks when configured. */
export async function convertHtmlToPdf(
  html: string,
  options: HtmlLayoutOptions
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const buf = new TextEncoder().encode(html).buffer as ArrayBuffer;
  return getWorker().convertHtmlToPdf(Comlink.transfer(buf, [buf]), options);
}
