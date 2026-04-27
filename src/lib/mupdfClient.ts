import * as Comlink from "comlink";
import type { MupdfWorkerApi } from "@/workers/mupdf.worker";
import { retrieveDoc } from "./pdfStore";
import type { PageRef, PdfMetadata, ExtractedImage, ImagePosition, BatesConfig, CompressConfig } from "./types";

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

// LRU cache for worker document handles.
// Caps the number of simultaneously open MuPDF documents in WASM memory.
// Re-opening an evicted document from the in-memory ArrayBuffer costs ~1-2ms.
const MAX_HANDLES = 20;
const handles = new Map<string, number>(); // insertion-order = LRU order

async function ensureLoaded(docId: string): Promise<number> {
  const existing = handles.get(docId);
  if (existing !== undefined) {
    // Move to end (most-recently-used) by re-inserting
    handles.delete(docId);
    handles.set(docId, existing);
    return existing;
  }

  // Evict least-recently-used handle if at capacity
  if (handles.size >= MAX_HANDLES) {
    const oldest = handles.keys().next().value!;
    const oldHandle = handles.get(oldest)!;
    handles.delete(oldest);
    getWorker().releaseDocument(oldHandle);
  }

  const data = retrieveDoc(docId);
  if (!data) throw new Error(`No document data for ${docId}`);

  const w = getWorker();
  // .slice(0) because transferring ownership removes the original in docStore
  const copy = data.slice(0);
  const handle = await w.openDocument(Comlink.transfer(copy, [copy]));
  handles.set(docId, handle);
  return handle;
}

export async function loadDocument(docId: string): Promise<void> {
  await ensureLoaded(docId);
}

export async function getPageCount(docId: string): Promise<number> {
  const handle = await ensureLoaded(docId);
  return getWorker().getPageCount(handle);
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
  const handle = await ensureLoaded(docId);
  const dpi = scale * 72;
  return getWorker().renderPage(handle, pageIndex, dpi, rotation);
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
}

export function releaseDocument(docId: string): void {
  const handle = handles.get(docId);
  if (handle !== undefined) {
    getWorker().releaseDocument(handle);
    handles.delete(docId);
  }
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
  const handle = await ensureLoaded(docId);
  const result = await getWorker().extractImages(handle, [pageIndex]);
  return result.images as ExtractedImage[];
}

/** Extract embedded images from all pages of a document. */
export async function extractImagesFromDocument(
  docId: string
): Promise<ExtractedImage[]> {
  const handle = await ensureLoaded(docId);
  const count = await getWorker().getPageCount(handle);
  const indices = Array.from({ length: count }, (_, i) => i);
  const result = await getWorker().extractImages(handle, indices);
  return result.images as ExtractedImage[];
}

/** Get canvas-pixel positions of images on a page for hit-testing. */
export async function getImagePositions(
  docId: string,
  pageIndex: number,
  scale: number,
  rotation: number = 0
): Promise<ImagePosition[]> {
  const handle = await ensureLoaded(docId);
  const dpi = scale * 72;
  return getWorker().getImagePositions(handle, pageIndex, dpi, rotation) as Promise<ImagePosition[]>;
}

/** Extract a single image by on-page index (matches getImagePositions ordering). Always PNG. */
export async function extractSingleImage(
  docId: string,
  pageIndex: number,
  imageIndex: number
): Promise<{ width: number; height: number; data: Uint8Array; mimeType: string; extension: string } | null> {
  const handle = await ensureLoaded(docId);
  return getWorker().extractSingleImage(handle, pageIndex, imageIndex);
}

/** Apply Bates numbering to all pages of a document. */
export async function applyBatesStamp(
  docId: string,
  config: BatesConfig & { startNumber: number }
): Promise<Uint8Array> {
  const handle = await ensureLoaded(docId);
  return getWorker().applyBatesStamp(handle, config);
}

/** Render a single page with Bates stamp for preview. */
export async function renderBatesPreview(
  docId: string,
  pageIndex: number,
  config: BatesConfig & { startNumber: number },
  dpi: number = 144
): Promise<ImageData> {
  const handle = await ensureLoaded(docId);
  return getWorker().renderBatesPreview(handle, pageIndex, config, dpi);
}

/** Compress a PDF — recompresses images as JPEG and re-saves with garbage collection / sanitization. */
export async function compressPdf(
  docId: string,
  config: CompressConfig
): Promise<Uint8Array> {
  const handle = await ensureLoaded(docId);
  return getWorker().compressPdf(handle, config);
}

/** Render a single page as it would appear after compression, for preview. */
export async function renderCompressedPreview(
  docId: string,
  pageIndex: number,
  config: CompressConfig,
  dpi: number = 144
): Promise<ImageData> {
  const handle = await ensureLoaded(docId);
  return getWorker().renderCompressedPreview(handle, pageIndex, config, dpi);
}

/** Encrypt a PDF with a password (used for both user and owner password). */
export async function encryptPdf(
  docId: string,
  password: string
): Promise<Uint8Array> {
  const handle = await ensureLoaded(docId);
  return getWorker().encryptPdf(handle, password);
}

/** Whether the document needs a password to read its pages. */
export async function needsPassword(docId: string): Promise<boolean> {
  const handle = await ensureLoaded(docId);
  return getWorker().needsPassword(handle);
}

/** Authenticate the document with a password. Returns true on success. */
export async function authenticatePassword(
  docId: string,
  password: string
): Promise<boolean> {
  const handle = await ensureLoaded(docId);
  return getWorker().authenticatePassword(handle, password);
}

/** Save the document with encryption removed. Document must be authenticated first. */
export async function decryptPdf(docId: string): Promise<Uint8Array> {
  const handle = await ensureLoaded(docId);
  return getWorker().decryptPdf(handle);
}

/** Merge pages into a single PDF using document handles for resource deduplication. */
export async function mergePdfs(
  pageRefs: PageRef[],
  metadata?: PdfMetadata
): Promise<Uint8Array> {
  // Ensure all unique source documents are loaded
  const uniqueDocIds = [...new Set(pageRefs.map((p) => p.sourceDocId))];
  const handleMap = new Map<string, number>();
  for (const docId of uniqueDocIds) {
    handleMap.set(docId, await ensureLoaded(docId));
  }

  // Build page specs using handles
  const pageSpecs = pageRefs.map((p) => ({
    handle: handleMap.get(p.sourceDocId)!,
    pageIndex: p.sourcePageIndex,
    rotation: p.rotation,
  }));

  return getWorker().mergeFromHandles(pageSpecs, metadata);
}
