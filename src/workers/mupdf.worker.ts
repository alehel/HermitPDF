// Note: the global `$libmupdf_wasm_Module` set in getMupdf() is declared by
// mupdf's own type definitions (mupdf.d.ts); it configures the Emscripten
// runtime so the .wasm binary is fetched from /public.

import * as Comlink from "comlink";
import type { BatesPosition, ExternalLink, ExtractedImage, OutlineEntry } from "@/lib/types";
import {
  formatBatesNumber,
  computeShrinkTransform,
  computeStampPosition,
  getQuadding,
} from "@/lib/batesStamp";
import {
  fitWithinResizeCap,
  isResizeActive,
  pageSizeInPoints,
  type ImageProcessConfig,
} from "@/lib/imageResize";
import { applyContrastToPixels, type ContrastConfig } from "@/lib/contrast";

type PdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
};

type BatesStampWorkerConfig = {
  prefix: string;
  startNumber: number;
  digits: number;
  position: BatesPosition;
  fontSize: number;
  padding: number;
  shrink: boolean;
};

type CompressWorkerConfig = {
  imageProcess: ImageProcessConfig;
  subsetFonts: boolean;
  deduplicateObjects: boolean;
  sanitizeStreams: boolean;
};

// Aliases for the MuPDF module and its runtime instance types so signatures
// stay readable.
type Mupdf = typeof import("mupdf");
type MupdfDocument = InstanceType<Mupdf["Document"]>;
type MupdfPDFDocument = InstanceType<Mupdf["PDFDocument"]>;
type MupdfPDFObject = InstanceType<Mupdf["PDFObject"]>;
type MupdfPDFPage = InstanceType<Mupdf["PDFPage"]>;
type MupdfImage = InstanceType<Mupdf["Image"]>;
type MupdfPixmap = InstanceType<Mupdf["Pixmap"]>;
type Matrix = [number, number, number, number, number, number];
type Rect = [number, number, number, number];

// Lazy-load mupdf WASM — initialized on first use, not at module load time.
// This lets Comlink.expose() run immediately so messages aren't lost.
let mupdfModule: Mupdf | null = null;
let mupdfLoading: Promise<Mupdf> | null = null;

async function getMupdf(): Promise<Mupdf> {
  if (mupdfModule) return mupdfModule;
  if (!mupdfLoading) {
    globalThis.$libmupdf_wasm_Module = {
      locateFile: (filename: string) => `/${filename}`,
    };
    mupdfLoading = import("mupdf");
  }
  mupdfModule = await mupdfLoading;
  return mupdfModule;
}

// Internal document storage keyed by numeric handle.
// We store the mupdf module ref alongside each doc so callers don't need
// to track which mupdf instance opened which document.
let nextHandle = 1;
const documents = new Map<number, { doc: MupdfDocument; mupdf: Mupdf }>();

function getDoc(handle: number) {
  const entry = documents.get(handle);
  if (!entry) throw new Error(`No document for handle ${handle}`);
  return entry;
}

/**
 * Compute the scale + rotation matrix for rendering a page with the given
 * bounds, normalized so the transformed page starts at a (0,0) origin.
 */
function computeRenderGeometry(
  mupdf: Mupdf,
  bounds: Rect,
  dpi: number,
  rotation: number
): { matrix: Matrix; normalizedBbox: Rect } {
  const zoom = dpi / 72;
  const pageWidth = bounds[2] - bounds[0];
  const pageHeight = bounds[3] - bounds[1];

  let matrix = mupdf.Matrix.scale(zoom, zoom);
  if (rotation !== 0) {
    const cx = (pageWidth * zoom) / 2;
    const cy = (pageHeight * zoom) / 2;
    matrix = mupdf.Matrix.concat(matrix, mupdf.Matrix.translate(-cx, -cy));
    matrix = mupdf.Matrix.concat(matrix, mupdf.Matrix.rotate(rotation));
    matrix = mupdf.Matrix.concat(matrix, mupdf.Matrix.translate(cx, cy));
  }

  const bbox = mupdf.Rect.transform(bounds, matrix);
  const bboxW = bbox[2] - bbox[0];
  const bboxH = bbox[3] - bbox[1];
  if (bbox[0] !== 0 || bbox[1] !== 0) {
    matrix = mupdf.Matrix.concat(
      matrix,
      mupdf.Matrix.translate(-bbox[0], -bbox[1])
    );
  }

  return { matrix, normalizedBbox: [0, 0, bboxW, bboxH] };
}

/**
 * Build the rendering matrix for a page at a given DPI and rotation.
 * Used by getImagePositions to map image bboxes to canvas coordinates.
 */
function buildPageMatrix(
  mupdf: Mupdf,
  doc: MupdfDocument,
  pageIndex: number,
  dpi: number,
  rotation: number = 0
): { matrix: Matrix; normalizedBbox: Rect } {
  const page = doc.loadPage(pageIndex);
  try {
    return computeRenderGeometry(mupdf, page.getBounds(), dpi, rotation);
  } finally {
    page.destroy();
  }
}

/**
 * Render a page to a white-backgrounded DeviceRGB pixmap using DrawDevice.
 *
 * Supports rotation (0, 90, 180, 270) applied via the transformation matrix.
 * `alpha` controls whether the pixmap carries an alpha channel — pass false
 * when the samples will be JPEG-encoded (JPEG can't represent alpha).
 *
 * Each WASM object (page, pixmap, device) must be explicitly destroyed
 * to free native memory promptly — the WASM heap only ever grows, so
 * waiting for the GC finalizer is not enough. The nested try/finally
 * blocks ensure cleanup even when rendering throws.
 */
function renderToPixmap(
  mupdf: Mupdf,
  doc: MupdfDocument,
  pageIndex: number,
  dpi: number,
  rotation: number = 0,
  alpha: boolean = true
): MupdfPixmap {
  const page = doc.loadPage(pageIndex);
  try {
    const { matrix, normalizedBbox } = computeRenderGeometry(
      mupdf,
      page.getBounds(),
      dpi,
      rotation
    );
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, normalizedBbox, alpha);
    try {
      pixmap.clear(255);
      const device = new mupdf.DrawDevice(matrix, pixmap);
      try {
        page.run(device, mupdf.Matrix.identity);
        device.close();
      } finally {
        device.destroy();
      }
    } catch (e) {
      pixmap.destroy();
      throw e;
    }
    return pixmap;
  } finally {
    page.destroy();
  }
}

/**
 * Render a page and copy the pixels into an ImageData. getPixels() returns a
 * view into the WASM heap, so the .slice() copy must happen before the pixmap
 * is destroyed; the copy's buffer is then safe to transfer to the main thread.
 */
function renderPageToImageData(
  mupdf: Mupdf,
  doc: MupdfDocument,
  pageIndex: number,
  dpi: number,
  rotation: number = 0
): ImageData {
  const pixmap = renderToPixmap(mupdf, doc, pageIndex, dpi, rotation);
  try {
    return new ImageData(
      pixmap.getPixels().slice(),
      pixmap.getWidth(),
      pixmap.getHeight()
    );
  } finally {
    pixmap.destroy();
  }
}

/**
 * Narrow encoder output for postMessage transfer. Pixmap.asPNG()/asJPEG()
 * already copy the encoded bytes out of the WASM heap (mupdf's fromBuffer
 * does HEAPU8.slice), so the backing buffer is a fresh ArrayBuffer that can
 * be transferred as-is — only the declared type is ArrayBufferLike. Do NOT
 * .slice() these results: that would copy multi-megabyte buffers a second
 * time for nothing.
 */
function asTransferableBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Save a document and copy the result out of the WASM heap. asUint8Array()
 * returns a view into WASM memory, so the .slice() copy must happen before
 * the buffer is destroyed; the copy is then safe to transfer.
 */
function saveToTransferableBytes(
  pdf: MupdfPDFDocument,
  options: string | Record<string, unknown>
): Uint8Array<ArrayBuffer> {
  const buf = pdf.saveToBuffer(options);
  try {
    return buf.asUint8Array().slice();
  } finally {
    buf.destroy();
  }
}

/** Fresh output document stamped with the app's Creator/Producer metadata. */
function newOutputPdf(mupdf: Mupdf): MupdfPDFDocument {
  const pdf = new mupdf.PDFDocument();
  pdf.setMetaData("info:Creator", "hermitpdf.eu");
  pdf.setMetaData("info:Producer", "hermitpdf.eu");
  return pdf;
}

/**
 * Inspect an image XObject's /Filter and decide whether we can emit its stream
 * as a standalone image file. DCTDecode → JPEG bytes, JPXDecode → JPEG 2000.
 * Chained filters (e.g. [ASCII85Decode, DCTDecode]) can't be saved standalone,
 * so we only treat single-element filter arrays as raw candidates.
 * Anything else returns null — caller falls back to MuPDF decode + PNG.
 */
function detectRawFormat(filter: MupdfPDFObject): { ext: string; mime: string } | null {
  const forName = (name: string) => {
    if (name === "DCTDecode") return { ext: "jpg", mime: "image/jpeg" };
    if (name === "JPXDecode") return { ext: "jp2", mime: "image/jp2" };
    return null;
  };
  if (filter.isName()) return forName(filter.asName());
  if (filter.isArray() && filter.length === 1) {
    const first = filter.get(0);
    if (first.isName()) return forName(first.asName());
  }
  return null;
}

/**
 * Read the ICC color profile bytes from an image XObject's /ColorSpace, if any.
 *
 * In PDFs, a JPEG with a tagged color profile doesn't embed the profile in its
 * own bytes — the encoder typically strips APP2 markers from the JPEG and
 * hoists the profile up into the image XObject's /ColorSpace entry. That entry
 * can take two forms we need to handle:
 *
 *   (a) Inline array:
 *         /ColorSpace [/ICCBased <profile-stream-ref>]
 *
 *   (b) Named reference to the containing page's resource dict:
 *         /ColorSpace /CS0
 *       …where the page's Resources dict defines:
 *         /Resources << /ColorSpace << /CS0 [/ICCBased <profile-stream-ref>] >> >>
 *
 * Form (b) is a dedup trick: when a page has multiple images sharing a profile,
 * the encoder (Photoshop, InDesign, most print-to-PDF flows) stores the ICCBased
 * array once in the page's resources and each image just references it by name.
 * We have to walk through the resource dict to recover the profile stream.
 *
 * The profile stream itself is usually FlateDecode-compressed; readStream()
 * returns the decompressed bytes — exactly what we need to re-embed into the JPEG.
 *
 * Returns null for the cases where there's nothing to inject: Device* spaces
 * (no profile at all), CalRGB/CalGray (non-ICC calibrated spaces), Pattern
 * spaces, and any named reference that can't be resolved through the resources
 * we were handed. Also returns null if the profile stream can't be read.
 */
function readIccProfileFromXObject(
  xobj: MupdfPDFObject,
  resources: MupdfPDFObject
): Uint8Array<ArrayBuffer> | null {
  let cs = xobj.get("ColorSpace");
  if (cs.isNull()) return null;

  // Form (b): the ColorSpace is a Name. Resolve it against the enclosing
  // resource dict's /ColorSpace sub-dict. Device* names resolve to themselves
  // (no profile) and need no lookup. Anything else must exist in resources
  // or we can't recover it.
  if (cs.isName()) {
    const name = cs.asName();
    if (
      name === "DeviceRGB" ||
      name === "DeviceGray" ||
      name === "DeviceCMYK" ||
      name === "Pattern"
    ) {
      return null;
    }
    if (resources.isNull()) return null;
    const csDict = resources.get("ColorSpace");
    if (csDict.isNull() || !csDict.isDictionary()) return null;
    cs = csDict.get(name);
    if (cs.isNull()) return null;
  }

  if (!cs.isArray() || cs.length < 2) return null;

  const kind = cs.get(0);
  if (!kind.isName() || kind.asName() !== "ICCBased") return null;

  const profileStream = cs.get(1);
  try {
    const buf = profileStream.readStream();
    try {
      return buf.asUint8Array().slice();
    } finally {
      buf.destroy();
    }
  } catch {
    return null;
  }
}

/**
 * Scan the header region of a JPEG for an existing APP2 "ICC_PROFILE" segment.
 *
 * Well-behaved PDF encoders strip APP segments from embedded JPEGs, but some
 * leave them intact. If the profile is already in the JPEG bytes, we must not
 * inject a second one — duplicate profiles can confuse color-managed viewers.
 *
 * Walk segment markers starting at SOI. Each APPn marker is `FF Ex` followed
 * by a 2-byte big-endian length (inclusive of the length bytes themselves).
 * Stop at the first non-APP marker — by the JPEG spec, APP segments appear
 * only in the header region, before SOF/DQT/DHT/SOS.
 */
const ICC_TAG = "ICC_PROFILE\0";

function hasEmbeddedIccProfile(jpegBytes: Uint8Array): boolean {
  if (jpegBytes.length < 4) return false;
  if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) return false; // not a JPEG SOI

  const decoder = new TextDecoder("latin1");
  let p = 2;
  while (p + 4 <= jpegBytes.length) {
    if (jpegBytes[p] !== 0xff) return false; // malformed — bail safely
    const marker = jpegBytes[p + 1];
    // APPn markers are 0xE0..0xEF. Anything else means we've moved past the
    // header region (SOF, DQT, SOS, …), so there's no ICC profile to find.
    if (marker < 0xe0 || marker > 0xef) return false;

    const segLen = (jpegBytes[p + 2] << 8) | jpegBytes[p + 3];
    if (segLen < 2 || p + 2 + segLen > jpegBytes.length) return false;

    if (marker === 0xe2 && segLen >= 2 + ICC_TAG.length) {
      const tag = decoder.decode(jpegBytes.subarray(p + 4, p + 4 + ICC_TAG.length));
      if (tag === ICC_TAG) return true;
    }

    p += 2 + segLen;
  }
  return false;
}

/**
 * Build a new JPEG that embeds the given ICC profile as one or more APP2
 * "ICC_PROFILE" segments, inserted right after the SOI marker.
 *
 * Segment layout (per the ICC-in-JPEG spec, ICC.1 Annex B.4):
 *
 *   FF E2                       APP2 marker
 *   LL LL                       segment length, big-endian, includes itself
 *   'I' 'C' 'C' '_' 'P' 'R' 'O' 'F' 'I' 'L' 'E' 00    12-byte marker
 *   NN                          1-based chunk index
 *   MM                          total chunk count (same in every segment)
 *   <profile-chunk>             up to 65519 bytes of ICC data
 *
 * A JPEG segment's length field is 16-bit, so its payload maxes out at
 * 65533 bytes. After the 14-byte ICC header (12-byte tag + 2 sequence bytes),
 * that leaves 65519 bytes of profile data per chunk. Profiles larger than
 * ~16 MB (255 chunks) can't be represented — this limit is never hit in
 * practice (real-world ICC profiles are typically 500 B – 10 KB).
 *
 * Inserting right after SOI is always valid: APP segments have no required
 * ordering relative to each other, and all compliant JPEG decoders scan the
 * full header region for APPn markers before decoding image data.
 */
function wrapJpegWithIccProfile(
  jpegBytes: Uint8Array<ArrayBuffer>,
  iccBytes: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  // Caller should have validated SOI, but re-check to avoid corrupting non-JPEGs.
  if (jpegBytes.length < 2 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return jpegBytes;
  }

  const MAX_CHUNK = 65519;      // APP2 payload cap minus the 14-byte ICC header
  const MAX_CHUNKS = 255;        // 8-bit chunk-index field
  const totalChunks = Math.max(1, Math.ceil(iccBytes.length / MAX_CHUNK));
  if (totalChunks > MAX_CHUNKS) return jpegBytes;

  const segments: Uint8Array[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * MAX_CHUNK;
    const end = Math.min(start + MAX_CHUNK, iccBytes.length);
    const chunkLen = end - start;

    // Segment length field counts: 2 (its own bytes) + 12 (tag) + 2 (seq bytes) + chunk
    const segLen = 2 + ICC_TAG.length + 2 + chunkLen;
    const seg = new Uint8Array(2 + segLen); // +2 for the FF E2 marker itself

    seg[0] = 0xff;
    seg[1] = 0xe2;
    seg[2] = (segLen >> 8) & 0xff;
    seg[3] = segLen & 0xff;
    for (let j = 0; j < ICC_TAG.length; j++) seg[4 + j] = ICC_TAG.charCodeAt(j);
    seg[4 + ICC_TAG.length] = i + 1;      // chunk sequence, 1-based per spec
    seg[4 + ICC_TAG.length + 1] = totalChunks;
    seg.set(iccBytes.subarray(start, end), 4 + ICC_TAG.length + 2);
    segments.push(seg);
  }

  // Assemble: SOI + APP2 segment(s) + rest of original JPEG.
  const rest = jpegBytes.subarray(2);
  const totalLen = 2 + segments.reduce((s, a) => s + a.length, 0) + rest.length;
  const out = new Uint8Array(totalLen);
  out[0] = 0xff;
  out[1] = 0xd8;
  let pos = 2;
  for (const seg of segments) {
    out.set(seg, pos);
    pos += seg.length;
  }
  out.set(rest, pos);
  return out;
}

/**
 * Mutable collector threaded through the recursive image walk. Bundling these
 * together keeps function signatures short and makes the fact that we're
 * building up shared state explicit.
 */
interface ImageWalkCtx {
  pdf: MupdfPDFDocument;
  seen: Set<number>;      // indirect object numbers already emitted
  images: ExtractedImage[];
  transferables: ArrayBuffer[];
  nextImageIndex: number;
}

/**
 * Extract one Image XObject, preserving its original encoding when the filter
 * is one we can save as a standalone file; otherwise decode + re-encode to PNG.
 */
function extractImageXObject(
  ctx: ImageWalkCtx,
  xobj: MupdfPDFObject,
  // Enclosing resource dict — needed to resolve named /ColorSpace references
  // (see readIccProfileFromXObject for the two forms that show up).
  resources: MupdfPDFObject,
  pageIndex: number
): void {
  // Dedup across pages by indirect object number — shared XObjects reuse the same ref.
  const objNum = xobj.isIndirect() ? xobj.asIndirect() : 0;
  if (objNum > 0) {
    if (ctx.seen.has(objNum)) return;
    ctx.seen.add(objNum);
  }

  const widthObj = xobj.get("Width");
  const heightObj = xobj.get("Height");
  if (!widthObj.isNumber() || !heightObj.isNumber()) return;
  const w = widthObj.asNumber();
  const h = heightObj.asNumber();
  if (w < 10 || h < 10) return;

  const pushImage = (data: Uint8Array<ArrayBuffer>, mimeType: string, extension: string) => {
    ctx.images.push({
      pageIndex,
      imageIndex: ctx.nextImageIndex++,
      width: w,
      height: h,
      data,
      mimeType,
      extension,
    });
    ctx.transferables.push(data.buffer);
  };

  const rawFormat = detectRawFormat(xobj.get("Filter"));
  if (rawFormat) {
    try {
      const rawBuffer = xobj.readRawStream();
      try {
        let data = rawBuffer.asUint8Array().slice();

        // For JPEGs, re-embed the ICC color profile the PDF keeps in /ColorSpace.
        // We only splice one in if the JPEG bytes don't already carry their own,
        // to avoid producing a file with two conflicting profiles. JP2 profiles
        // live in the file's box structure rather than APP markers, so this
        // wrapping step doesn't apply there — pass those bytes through as-is.
        if (rawFormat.mime === "image/jpeg" && !hasEmbeddedIccProfile(data)) {
          const iccBytes = readIccProfileFromXObject(xobj, resources);
          if (iccBytes) data = wrapJpegWithIccProfile(data, iccBytes);
        }

        pushImage(data, rawFormat.mime, rawFormat.ext);
        return;
      } finally {
        rawBuffer.destroy();
      }
    } catch {
      // Raw stream unreadable; fall through to PNG decode path.
    }
  }

  const image = ctx.pdf.loadImage(xobj);
  try {
    const pixmap = image.toPixmap();
    try {
      pushImage(asTransferableBytes(pixmap.asPNG()), "image/png", "png");
    } finally {
      pixmap.destroy();
    }
  } finally {
    image.destroy();
  }
}

/**
 * Walk a Resources dict recursively, descending into Form XObjects so that
 * images nested inside reused form content are extracted too.
 */
function walkResourcesForImages(
  ctx: ImageWalkCtx,
  resources: MupdfPDFObject,
  pageIndex: number
): void {
  if (resources.isNull()) return;
  const xobjs = resources.get("XObject");
  if (xobjs.isNull() || !xobjs.isDictionary()) return;

  xobjs.forEach((val) => {
    const subtype = val.get("Subtype");
    if (!subtype.isName()) return;
    const subtypeName = subtype.asName();
    if (subtypeName === "Image") {
      // Pass down the current resources so that images whose /ColorSpace is a
      // Name (e.g. /CS0) can be resolved against the enclosing resource dict.
      extractImageXObject(ctx, val, resources, pageIndex);
    } else if (subtypeName === "Form") {
      // Form XObjects carry their own Resources dict per the PDF spec; any
      // named colorspaces used inside are expected to be defined there rather
      // than inherited from the page.
      walkResourcesForImages(ctx, val.get("Resources"), pageIndex);
    }
  });
}

/**
 * Raw-walk extraction path — goes directly through the PDF resource tree so
 * DCTDecode/JPXDecode streams can be emitted untouched and ICC profiles
 * re-embedded. Dedupes by indirect object number across pages.
 */
function extractImagesViaRawWalk(
  pdf: MupdfPDFDocument,
  pageIndices: number[]
): { images: ExtractedImage[]; transferables: ArrayBuffer[] } {
  const ctx: ImageWalkCtx = {
    pdf,
    seen: new Set(),
    images: [],
    transferables: [],
    nextImageIndex: 0,
  };
  for (const pageIndex of pageIndices) {
    const pageObj = pdf.findPage(pageIndex);
    const resources = pageObj.getInheritable("Resources");
    walkResourcesForImages(ctx, resources, pageIndex);
  }
  return { images: ctx.images, transferables: ctx.transferables };
}

/**
 * Fallback extraction for non-PDF inputs (or if asPDF() returns null). Uses
 * the structured-text walker and always emits PNG, deduped by a prefix hash
 * since we don't have a stable object number here.
 */
function extractImagesViaStextWalker(
  doc: MupdfDocument,
  pageIndices: number[]
): { images: ExtractedImage[]; transferables: ArrayBuffer[] } {
  const seen = new Set<string>();
  const images: ExtractedImage[] = [];
  const transferables: ArrayBuffer[] = [];

  for (const pageIndex of pageIndices) {
    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        let imgIdx = 0;
        stext.walk({
          onImageBlock(_bbox, _transform, image) {
            const w = image.getWidth();
            const h = image.getHeight();
            if (w < 10 || h < 10) return;

            const pixmap = image.toPixmap();
            try {
              const data = asTransferableBytes(pixmap.asPNG());

              const prefix = data.slice(0, 32);
              const key = `${w}x${h}:${Array.from(prefix).map(b => b.toString(16).padStart(2, "0")).join("")}`;
              if (seen.has(key)) return;
              seen.add(key);

              images.push({
                pageIndex,
                imageIndex: imgIdx++,
                width: w,
                height: h,
                data,
                mimeType: "image/png",
                extension: "png",
              });
              transferables.push(data.buffer);
            } finally {
              pixmap.destroy();
            }
          },
        });
      } finally {
        stext.destroy();
      }
    } finally {
      page.destroy();
    }
  }

  return { images, transferables };
}

/**
 * Re-encode an Image XObject as JPEG at the given quality and overwrite its
 * stream + dict in place. Skips images that aren't safe to re-encode this way:
 * tiny images, image masks, and images with separate masks/SMasks (alpha or
 * stencil compositing) — those need bytes-identical layout to keep the page
 * looking right.
 *
 * Done in-place rather than via addImage() so we don't have to walk every
 * resource dict to swap references; the original indirect ref keeps pointing
 * to the same object, just with new contents.
 */
function recompressImageXObject(
  mupdf: Mupdf,
  pdf: MupdfPDFDocument,
  xobj: MupdfPDFObject,
  seen: Set<number>,
  config: ImageProcessConfig
): void {
  const objNum = xobj.isIndirect() ? xobj.asIndirect() : 0;
  if (objNum > 0) {
    if (seen.has(objNum)) return;
    seen.add(objNum);
  }

  const widthObj = xobj.get("Width");
  const heightObj = xobj.get("Height");
  if (!widthObj.isNumber() || !heightObj.isNumber()) return;
  const w = widthObj.asNumber();
  const h = heightObj.asNumber();
  // Skip thumbnails and decorative bits — re-encoding them costs more than
  // the savings, and the artifacts are more visible at small sizes.
  if (w < 100 || h < 100) return;

  // Caller already gated on config.recompress, so we always re-encode here.
  // fitWithinResizeCap returns a no-op {scaled:false} when pageSize is
  // "Original", so we can call it unconditionally.
  const targetSize = fitWithinResizeCap(w, h, config.resize);
  const quality = config.quality;

  // ImageMasks are 1-bit stencils; recompressing as JPEG would silently
  // produce an opaque rectangle. Mask/SMask images participate in alpha or
  // stencil compositing with another image; we can't safely replace just one
  // half of the pair without recompressing both in lockstep.
  const imageMaskObj = xobj.get("ImageMask");
  if (imageMaskObj.isBoolean() && imageMaskObj.asBoolean()) return;
  if (!xobj.get("SMask").isNull()) return;
  if (!xobj.get("Mask").isNull()) return;

  let image: MupdfImage | null = null;
  try {
    image = pdf.loadImage(xobj);
  } catch {
    return;
  }

  try {
    const pixmap = image.toPixmap();
    let pixmapForJpeg = pixmap;
    let createdRgbCopy = false;
    let resizedPixmap: MupdfPixmap | null = null;
    try {
      // JPEG can't carry an alpha channel, and CMYK JPEGs need a separate
      // path with invert_cmyk. Convert anything that isn't 1- or 3-component
      // RGB/Gray-without-alpha to plain RGB before encoding.
      const numComponents = pixmap.getNumberOfComponents();
      const hasAlpha = pixmap.getAlpha() > 0;
      if (hasAlpha || numComponents > 3) {
        pixmapForJpeg = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
        createdRgbCopy = true;
      }

      // Downscale to the resize cap. Pixmap.warp resamples to the target W/H
      // using the source's own corner points — when passed axis-aligned
      // corners this is a straight resample (no perspective).
      if (targetSize.scaled) {
        const srcW = pixmapForJpeg.getWidth();
        const srcH = pixmapForJpeg.getHeight();
        const corners: [number, number][] = [
          [0, 0],
          [srcW, 0],
          [srcW, srcH],
          [0, srcH],
        ];
        resizedPixmap = pixmapForJpeg.warp(corners, targetSize.width, targetSize.height);
        if (createdRgbCopy) pixmapForJpeg.destroy();
        pixmapForJpeg = resizedPixmap;
        createdRgbCopy = false;
      }

      const finalComponents = pixmapForJpeg.getNumberOfComponents();
      const outputColorSpace = finalComponents === 1 ? "DeviceGray" : "DeviceRGB";

      // asJPEG already copies out of the WASM heap; the bytes stay worker-side.
      const jpegBytes = pixmapForJpeg.asJPEG(quality);

      // Replace the dict entries that describe the encoding so they match the
      // new JPEG bytes. Drop entries that would conflict with DCTDecode.
      xobj.put("Filter", pdf.newName("DCTDecode"));
      xobj.put("ColorSpace", pdf.newName(outputColorSpace));
      xobj.put("BitsPerComponent", pdf.newInteger(8));
      xobj.put("Width", pdf.newInteger(pixmapForJpeg.getWidth()));
      xobj.put("Height", pdf.newInteger(pixmapForJpeg.getHeight()));
      xobj.delete("DecodeParms");
      xobj.delete("Decode");

      // writeRawStream keeps the bytes as-is (no flate wrap) — DCTDecode
      // images carry their compression in the JPEG container itself.
      xobj.writeRawStream(jpegBytes);
    } finally {
      if (resizedPixmap) resizedPixmap.destroy();
      else if (createdRgbCopy) pixmapForJpeg.destroy();
      pixmap.destroy();
    }
  } catch {
    // Anything we can't recompress (unusual color spaces, decode failures)
    // is left alone — the original encoding still works.
  } finally {
    image.destroy();
  }
}

/**
 * Walk a Resources dict recursively, recompressing every Image XObject we
 * encounter and descending into Form XObjects so nested images aren't missed.
 * Dedupes by indirect object number so a shared image is only recompressed
 * once even when it appears on multiple pages.
 */
function walkResourcesForRecompression(
  mupdf: Mupdf,
  pdf: MupdfPDFDocument,
  resources: MupdfPDFObject,
  seen: Set<number>,
  config: ImageProcessConfig
): void {
  if (resources.isNull()) return;
  const xobjs = resources.get("XObject");
  if (xobjs.isNull() || !xobjs.isDictionary()) return;

  xobjs.forEach((val) => {
    const subtype = val.get("Subtype");
    if (!subtype.isName()) return;
    const subtypeName = subtype.asName();
    if (subtypeName === "Image") {
      recompressImageXObject(mupdf, pdf, val, seen, config);
    } else if (subtypeName === "Form") {
      walkResourcesForRecompression(mupdf, pdf, val.get("Resources"), seen, config);
    }
  });
}

/**
 * Walk every Image XObject reachable from the document's pages and recompress
 * and/or downsample as the config dictates. Modifies the PDFDocument in place.
 *
 * Each image decides independently whether to be re-encoded: if recompress is
 * on, all are; if only resize is on, just the oversized ones are. The quality
 * setting is applied to whatever images do get re-encoded.
 */
function recompressAllImages(
  mupdf: Mupdf,
  pdf: MupdfPDFDocument,
  config: ImageProcessConfig
): void {
  const seen = new Set<number>();
  const pageCount = pdf.countPages();
  for (let i = 0; i < pageCount; i++) {
    const pageObj = pdf.findPage(i);
    const resources = pageObj.getInheritable("Resources");
    walkResourcesForRecompression(mupdf, pdf, resources, seen, config);
  }
}

/** Shared saveToBuffer options for compression-targeted writes. */
function buildCompressSaveOptions(config: CompressWorkerConfig): Record<string, unknown> {
  return {
    compress: true,
    "compress-images": true,
    "compress-fonts": true,
    garbage: config.deduplicateObjects ? "deduplicate" : "yes",
    sanitize: config.sanitizeStreams,
  };
}

/**
 * Append a page to `pdf` that draws a single image XObject named "Img".
 * `drawW/drawH` give the image's on-page size in points, offset `drawX/drawY`
 * from the bottom-left of a `pageW × pageH` page; they default to full-bleed.
 */
function addImagePage(
  pdf: MupdfPDFDocument,
  image: MupdfImage,
  pageW: number,
  pageH: number,
  drawW: number = pageW,
  drawH: number = pageH,
  drawX: number = 0,
  drawY: number = 0
): void {
  const imgRef = pdf.addImage(image);
  const resources = pdf.addObject(pdf.newDictionary());
  const xobjects = pdf.newDictionary();
  xobjects.put("Img", imgRef);
  resources.put("XObject", xobjects);

  const contents = `q ${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm /Img Do Q`;
  const pageObj = pdf.addPage([0, 0, pageW, pageH], 0, resources, contents);
  pdf.insertPage(-1, pageObj);
}

/** Physical size of an image in points, using its embedded resolution. */
function imageSizeInPoints(image: MupdfImage): { w: number; h: number } {
  const xRes = image.getXResolution() || 72;
  const yRes = image.getYResolution() || 72;
  return {
    w: (image.getWidth() / xRes) * 72,
    h: (image.getHeight() / yRes) * 72,
  };
}

function imageToPdf(
  mupdf: Mupdf,
  data: ArrayBuffer
): MupdfPDFDocument {
  const pdf = new mupdf.PDFDocument();
  const img = new mupdf.Image(data);
  try {
    const { w, h } = imageSizeInPoints(img);
    addImagePage(pdf, img, w, h);
  } finally {
    img.destroy();
  }
  return pdf;
}

/**
 * Build a single image-derived page inside `outputPdf` from the source
 * image-derived PDF, applying the given image processing config (resize +
 * recompress). The source is expected to be an image-derived PDF created
 * by imageToPdf (single page, single image XObject named "Img").
 *
 * The new page is sized to the chosen paper size when resize is on, or to
 * the image's natural physical size otherwise. The image is centred and
 * scaled to fit within the page bounds preserving aspect ratio.
 */
function appendProcessedImagePage(
  mupdf: Mupdf,
  outputPdf: MupdfPDFDocument,
  sourcePdf: MupdfPDFDocument,
  config: ImageProcessConfig
): void {
  // Pull the source image XObject off the source's first page.
  const sourcePage = sourcePdf.findPage(0);
  const resources = sourcePage.get("Resources");
  const xobjs = resources.get("XObject");
  const imgObj = xobjs.get("Img");
  const sourceImage = sourcePdf.loadImage(imgObj);

  let processedImage: MupdfImage = sourceImage;
  let imageOwnedHere = false; // Whether we created the image ourselves and must destroy it

  try {
    const srcW = sourceImage.getWidth();
    const srcH = sourceImage.getHeight();
    const target = fitWithinResizeCap(srcW, srcH, config.resize);

    // Caller already gated on config.recompress (it's the master toggle), so
    // we always re-encode. Resize is just an optional pre-step before the
    // JPEG re-encode.
    if (config.recompress) {
      const pixmap = sourceImage.toPixmap();
      try {
        let pixmapToEncode = pixmap;
        let resized: MupdfPixmap | null = null;
        try {
          if (target.scaled) {
            const corners: [number, number][] = [
              [0, 0],
              [srcW, 0],
              [srcW, srcH],
              [0, srcH],
            ];
            resized = pixmap.warp(corners, target.width, target.height);
            pixmapToEncode = resized;
          }
          // asJPEG already copies out of the WASM heap; bytes stay worker-side.
          const jpegBytes = pixmapToEncode.asJPEG(config.quality);
          processedImage = new mupdf.Image(jpegBytes);
          imageOwnedHere = true;
        } finally {
          if (resized) resized.destroy();
        }
      } finally {
        pixmap.destroy();
      }
    }

    // Page dimensions: paper size when resize is active, natural size otherwise.
    let pageW: number;
    let pageH: number;
    if (isResizeActive(config.resize)) {
      const { shortPt, longPt } = pageSizeInPoints(
        // Safe: isResizeActive guards out "Original"
        config.resize.pageSize as Exclude<typeof config.resize.pageSize, "Original">
      );
      const imgLandscape = processedImage.getWidth() >= processedImage.getHeight();
      pageW = imgLandscape ? longPt : shortPt;
      pageH = imgLandscape ? shortPt : longPt;
    } else {
      ({ w: pageW, h: pageH } = imageSizeInPoints(processedImage));
    }

    // Fit image into page bounds preserving aspect ratio, then centre.
    const imgAspect = processedImage.getWidth() / processedImage.getHeight();
    const pageAspect = pageW / pageH;
    let drawW: number;
    let drawH: number;
    if (imgAspect > pageAspect) {
      drawW = pageW;
      drawH = pageW / imgAspect;
    } else {
      drawH = pageH;
      drawW = pageH * imgAspect;
    }
    const drawX = (pageW - drawW) / 2;
    const drawY = (pageH - drawH) / 2;

    addImagePage(outputPdf, processedImage, pageW, pageH, drawW, drawH, drawX, drawY);
  } finally {
    if (imageOwnedHere) processedImage.destroy();
    sourceImage.destroy();
  }
}

/**
 * Read a page's /Contents stream(s) as text. Content may be a single stream
 * or an array of streams (both allowed by the PDF spec); array parts are
 * joined with newlines. Returns "" when the stream data can't be read (seen
 * on some grafted pages) — callers treat that as "skip".
 *
 * readStream() returns a Buffer wrapping native memory; destroy it promptly
 * instead of leaving it to the GC finalizer, since the WASM heap never shrinks.
 */
function readPageContentText(contentsObj: MupdfPDFObject): string {
  const readOne = (obj: MupdfPDFObject): string => {
    const buf = obj.readStream();
    try {
      return buf.asString();
    } finally {
      buf.destroy();
    }
  };
  try {
    if (contentsObj.isArray()) {
      const parts: string[] = [];
      for (let s = 0; s < contentsObj.length; s++) {
        parts.push(readOne(contentsObj.get(s)));
      }
      return parts.join("\n");
    }
    return readOne(contentsObj);
  } catch {
    return "";
  }
}

/**
 * Shrink a page's content by wrapping its stream in a q/Q + cm transform,
 * clearing room for the Bates stamp. No-op when the content stream can't be
 * read — the stamp then overlays the unshrunk content.
 */
function shrinkPageContent(
  output: MupdfPDFDocument,
  pageObj: MupdfPDFObject,
  pageWidth: number,
  pageHeight: number,
  config: BatesStampWorkerConfig
): void {
  const contentsObj = pageObj.get("Contents");
  if (contentsObj.isNull()) return;

  const originalStream = readPageContentText(contentsObj);
  if (!originalStream) return;

  const t = computeShrinkTransform(
    pageWidth,
    pageHeight,
    config.position,
    config.fontSize,
    config.padding
  );
  const wrappedStream =
    `q ${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f} cm\n` +
    originalStream +
    "\nQ\n";

  pageObj.put("Contents", output.addStream(wrappedStream, {}));
}

/**
 * Stamp one page of `output` with a Bates number: optionally shrink the
 * existing content to clear a margin, then add the stamp as a FreeText
 * annotation. The annotation still needs a later bake() to become permanent
 * page content — the caller bakes once after stamping all pages.
 */
function stampBatesOnPage(
  output: MupdfPDFDocument,
  pageIndex: number,
  batesText: string,
  config: BatesStampWorkerConfig
): void {
  const pageObj = output.findPage(pageIndex);
  const mediaBox = pageObj.get("MediaBox");
  const pageWidth = mediaBox.get(2).asNumber() - mediaBox.get(0).asNumber();
  const pageHeight = mediaBox.get(3).asNumber() - mediaBox.get(1).asNumber();

  if (config.shrink) {
    shrinkPageContent(output, pageObj, pageWidth, pageHeight, config);
  }

  const page = output.loadPage(pageIndex) as MupdfPDFPage;
  try {
    const annot = page.createAnnotation("FreeText");
    const pos = computeStampPosition(
      pageWidth,
      pageHeight,
      config.position,
      config.fontSize,
      config.padding
    );
    const quadding = getQuadding(config.position);

    // Annotation rect spans from the stamp position to the far page edge so
    // the quadding (text alignment) lands the text where expected.
    const rectHeight = config.fontSize + config.padding;
    let rectX0: number, rectX1: number;
    if (quadding === 0) {
      // Left-aligned
      rectX0 = pos.x;
      rectX1 = pageWidth - config.padding;
    } else if (quadding === 2) {
      // Right-aligned
      rectX0 = config.padding;
      rectX1 = pos.x;
    } else {
      // Center
      rectX0 = config.padding;
      rectX1 = pageWidth - config.padding;
    }

    annot.setRect([rectX0, pos.y, rectX1, pos.y + rectHeight]);
    annot.setDefaultAppearance("Helv", config.fontSize, [0, 0, 0]);
    annot.setContents(batesText);
    annot.setQuadding(quadding);
    annot.setBorderWidth(0);
    annot.setColor([]);
    annot.update();
  } finally {
    page.destroy();
  }
}

// In-progress image-page PDF builds for the incremental export API, keyed by
// build handle. Each document is owned by its build and destroyed on
// finish/abort.
const imagePdfBuilds = new Map<number, MupdfPDFDocument>();
let nextBuildId = 1;

function getBuild(buildId: number): MupdfPDFDocument {
  const pdf = imagePdfBuilds.get(buildId);
  if (!pdf) throw new Error(`No image PDF build for id ${buildId}`);
  return pdf;
}

const api = {
  async openDocument(
    data: ArrayBuffer,
    magic: string = "application/pdf"
  ): Promise<number> {
    const mupdf = await getMupdf();

    let doc;
    if (magic.startsWith("image/")) {
      doc = imageToPdf(mupdf, data);
    } else {
      doc = mupdf.Document.openDocument(data, magic);
    }

    const handle = nextHandle++;
    documents.set(handle, { doc, mupdf });
    return handle;
  },

  getPageCount(handle: number): number {
    const { doc } = getDoc(handle);
    return doc.countPages();
  },

  renderPage(
    handle: number,
    pageIndex: number,
    dpi: number,
    rotation: number = 0
  ): ImageData {
    const { doc, mupdf } = getDoc(handle);
    const imageData = renderPageToImageData(mupdf, doc, pageIndex, dpi, rotation);
    return Comlink.transfer(imageData, [imageData.data.buffer]);
  },

  renderThumbnail(
    handle: number,
    pageIndex: number,
    targetWidth: number,
    dpr: number,
    rotation: number = 0
  ): { pngData: Uint8Array; aspectRatio: number } {
    const { doc, mupdf } = getDoc(handle);
    const page = doc.loadPage(pageIndex);
    const bounds = page.getBounds();
    page.destroy();

    const pageWidth = bounds[2] - bounds[0];
    const pageHeight = bounds[3] - bounds[1];

    // Account for rotation when calculating aspect ratio and DPI
    const isRotated = rotation === 90 || rotation === 270;
    const displayWidth = isRotated ? pageHeight : pageWidth;
    const displayHeight = isRotated ? pageWidth : pageHeight;
    const aspectRatio = displayHeight / displayWidth;
    const dpi = ((targetWidth * dpr) / displayWidth) * 72;

    const pixmap = renderToPixmap(mupdf, doc, pageIndex, dpi, rotation);
    let pngData: Uint8Array<ArrayBuffer>;
    try {
      pngData = asTransferableBytes(pixmap.asPNG());
    } finally {
      pixmap.destroy();
    }
    return Comlink.transfer({ pngData, aspectRatio }, [pngData.buffer]);
  },

  releaseDocument(handle: number): void {
    const entry = documents.get(handle);
    if (entry) {
      entry.doc.destroy();
      documents.delete(handle);
    }
  },

  /**
   * Extract embedded images from specified pages of a document.
   *
   * For PDFs: walks resource dicts directly. Images stored with DCTDecode
   * (JPEG) or JPXDecode (JPEG 2000) are emitted in their original bytes with
   * color profiles re-embedded where available; anything else is decoded and
   * re-encoded to PNG. Dedupes by indirect object number so shared images
   * aren't extracted repeatedly across pages.
   *
   * For non-PDF documents (rare — this app is PDF-first), falls back to the
   * structured-text walker and emits PNG for every image, deduped by a prefix
   * hash since no stable object number is available.
   *
   * Skips tiny images (< 10x10 px) that are likely decorative.
   */
  extractImages(
    handle: number,
    pageIndices: number[]
  ): { images: ExtractedImage[] } {
    const { doc } = getDoc(handle);
    const pdf = doc.asPDF();
    const { images, transferables } = pdf
      ? extractImagesViaRawWalk(pdf, pageIndices)
      : extractImagesViaStextWalker(doc, pageIndices);
    return Comlink.transfer({ images }, transferables);
  },

  /**
   * Get canvas-pixel positions of images on a page, matching the render matrix
   * used by renderToPixmap at the given DPI and rotation.
   */
  getImagePositions(
    handle: number,
    pageIndex: number,
    dpi: number,
    rotation: number = 0
  ): { imageIndex: number; bbox: Rect; width: number; height: number }[] {
    const { doc, mupdf } = getDoc(handle);
    const { matrix } = buildPageMatrix(mupdf, doc, pageIndex, dpi, rotation);

    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        const positions: { imageIndex: number; bbox: Rect; width: number; height: number }[] = [];
        let imgIdx = 0;
        stext.walk({
          onImageBlock(bbox, _transform, image) {
            const w = image.getWidth();
            const h = image.getHeight();
            if (w < 10 || h < 10) return;
            const transformed = mupdf.Rect.transform(bbox, matrix);
            positions.push({ imageIndex: imgIdx++, bbox: transformed, width: w, height: h });
          },
        });
        return positions;
      } finally {
        stext.destroy();
      }
    } finally {
      page.destroy();
    }
  },

  /**
   * Extract a single image by on-page index, matching the ordering used by
   * getImagePositions (structured-text walker). Always returns PNG — the
   * index-based API can't correlate back to the raw PDF stream.
   */
  extractSingleImage(
    handle: number,
    pageIndex: number,
    imageIndex: number
  ): { width: number; height: number; data: Uint8Array; mimeType: string; extension: string } | null {
    type SingleImage = {
      width: number;
      height: number;
      data: Uint8Array<ArrayBuffer>;
      mimeType: string;
      extension: string;
    };
    const { doc } = getDoc(handle);
    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        let imgIdx = 0;
        let found: SingleImage | null = null;
        stext.walk({
          onImageBlock(_bbox, _transform, image) {
            if (found) return; // already found
            const w = image.getWidth();
            const h = image.getHeight();
            if (w < 10 || h < 10) return;
            if (imgIdx++ !== imageIndex) return;

            const pixmap = image.toPixmap();
            try {
              const data = asTransferableBytes(pixmap.asPNG());
              found = { width: w, height: h, data, mimeType: "image/png", extension: "png" };
            } finally {
              pixmap.destroy();
            }
          },
        });
        // TS narrows `found` to null here (it can't see the closure write),
        // so widen it back explicitly.
        const result = found as SingleImage | null;
        if (!result) return null;
        return Comlink.transfer(result, [result.data.buffer]);
      } finally {
        stext.destroy();
      }
    } finally {
      page.destroy();
    }
  },

  /**
   * Apply Bates numbering to all pages of a document.
   * Creates a new PDF with stamps baked into the page content.
   *
   * When shrink is enabled, the original content is scaled down via a
   * content-stream transformation matrix (q/Q + cm) to make room for the stamp.
   * The stamp is added as a FreeText annotation, then baked into the page.
   */
  async applyBatesStamp(
    handle: number,
    config: BatesStampWorkerConfig
  ): Promise<Uint8Array> {
    const { doc: sourceDoc, mupdf } = getDoc(handle);
    const output = newOutputPdf(mupdf);
    try {
      const pageCount = sourceDoc.countPages();
      for (let i = 0; i < pageCount; i++) {
        output.graftPage(i, sourceDoc as MupdfPDFDocument, i);
      }

      for (let i = 0; i < pageCount; i++) {
        const batesText = formatBatesNumber(config.prefix, config.startNumber + i, config.digits);
        stampBatesOnPage(output, i, batesText, config);
      }

      // Bake annotations into page content so stamps are permanent
      output.bake(true, false);

      const bytes = saveToTransferableBytes(output, "compress");
      return Comlink.transfer(bytes, [bytes.buffer]);
    } finally {
      output.destroy();
    }
  },

  /**
   * Render a single page with Bates stamp applied, for preview purposes.
   * Creates a temporary document, applies the stamp to one page, renders it,
   * then discards the temporary document immediately.
   */
  async renderBatesPreview(
    handle: number,
    pageIndex: number,
    config: BatesStampWorkerConfig,
    dpi: number
  ): Promise<ImageData> {
    const { doc: sourceDoc, mupdf } = getDoc(handle);
    const output = new mupdf.PDFDocument();
    try {
      // Graft just the one page, stamp it, and render it.
      output.graftPage(0, sourceDoc as MupdfPDFDocument, pageIndex);
      const batesText = formatBatesNumber(config.prefix, config.startNumber, config.digits);
      stampBatesOnPage(output, 0, batesText, config);
      output.bake(true, false);

      const imageData = renderPageToImageData(mupdf, output, 0, dpi);
      return Comlink.transfer(imageData, [imageData.data.buffer]);
    } finally {
      output.destroy();
    }
  },

  /**
   * Flatten the document's outline (bookmarks) into a list with pre-computed
   * page ranges. Each entry's pageEnd is derived from the next entry at the
   * same or shallower level — so a parent's range naturally spans its subtree.
   * Returns null when the document has no outline; entries whose target is a
   * URI rather than a page are skipped (children still recurse).
   */
  loadOutline(handle: number): OutlineEntry[] | null {
    const { doc } = getDoc(handle);
    const outline = doc.loadOutline();
    if (!outline || outline.length === 0) return null;

    const pageCount = doc.countPages();
    const entries: OutlineEntry[] = [];
    let nextId = 0;

    type RawItem = { title?: string; page?: number; down?: RawItem[] };
    const walk = (items: RawItem[], level: number, parentId: string | null) => {
      for (const item of items) {
        const page = typeof item.page === "number" ? item.page : -1;
        const children = item.down;
        if (page < 0) {
          if (children) walk(children, level, parentId);
          continue;
        }
        const myId = `o${nextId++}`;
        entries.push({
          id: myId,
          title: item.title?.trim() || "(untitled)",
          level,
          pageStart: page,
          pageEnd: pageCount - 1,
          hasChildren: !!(children && children.length > 0),
          parentId,
        });
        if (children) walk(children, level + 1, myId);
      }
    };
    walk(outline as unknown as RawItem[], 0, null);

    for (let i = 0; i < entries.length; i++) {
      const me = entries[i];
      let end = pageCount - 1;
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].level <= me.level) {
          end = Math.max(me.pageStart, entries[j].pageStart - 1);
          break;
        }
      }
      me.pageEnd = end;
    }

    return entries;
  },

  /**
   * Collect external web links (http/https URIs) from every page of the
   * document. Internal navigation links — TOC entries, cross-references —
   * resolve to a page in the same document and are skipped, as are external
   * schemes that aren't websites (mailto:, file:, …). Duplicate hits of the
   * same URI on the same page (e.g. a link annotation split across lines)
   * are collapsed; the same URI on different pages is kept per page so the
   * caller can show where each link appears.
   *
   * A PDF link is just a rectangle over the page with a URI attached — it
   * has no intrinsic anchor text. To recover the visible label ("Read the
   * full report"), each page with links is walked via structured text and
   * every character whose quad midpoint falls inside a link's (slightly
   * expanded) rectangle is accumulated into that link's label. Links over
   * images or empty regions end up with an empty label.
   */
  getExternalLinks(handle: number): ExternalLink[] {
    const { doc } = getDoc(handle);
    const results: ExternalLink[] = [];
    const pageCount = doc.countPages();
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      try {
        const hits: { uri: string; rect: Rect; text: string; pendingGap: boolean }[] = [];
        for (const link of page.getLinks()) {
          try {
            if (!link.isExternal()) continue;
            const uri = link.getURI();
            if (!/^https?:\/\//i.test(uri)) continue;
            hits.push({ uri, rect: link.getBounds(), text: "", pendingGap: false });
          } finally {
            link.destroy();
          }
        }
        if (hits.length === 0) continue;

        const stext = page.toStructuredText();
        try {
          stext.walk({
            onChar(c, _origin, _font, _size, quad) {
              const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
              const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
              for (const hit of hits) {
                const [x0, y0, x1, y1] = hit.rect;
                // 1pt tolerance: link rects are often drawn tight around the
                // glyph boxes and would otherwise drop edge characters.
                if (cx >= x0 - 1 && cx <= x1 + 1 && cy >= y0 - 1 && cy <= y1 + 1) {
                  if (hit.pendingGap && hit.text) hit.text += " ";
                  hit.pendingGap = false;
                  hit.text += c;
                }
              }
            },
            endLine() {
              // Chars carry no whitespace across lines; remember the boundary
              // so multi-line labels get a space instead of running together.
              for (const hit of hits) hit.pendingGap = true;
            },
          });
        } finally {
          stext.destroy();
        }

        // Merge duplicate URI hits on the same page. Multi-line links are
        // often split into one annotation per line — stitch their label
        // fragments together; identical repeats (e.g. the same nav link in
        // header and footer) are kept once via the containment check.
        const byUri = new Map<string, ExternalLink>();
        for (const hit of hits) {
          const label = hit.text.replace(/\s+/g, " ").trim();
          const existing = byUri.get(hit.uri);
          if (!existing) {
            byUri.set(hit.uri, { uri: hit.uri, pageIndex: i, label });
          } else if (label && !existing.label.includes(label)) {
            existing.label = existing.label ? `${existing.label} ${label}` : label;
          }
        }
        results.push(...byUri.values());
      } finally {
        page.destroy();
      }
    }
    return results;
  },

  /**
   * Whether the open document is encrypted and requires a password before
   * pages can be read or saved unencrypted. Returns false for non-encrypted
   * PDFs as well as for documents already authenticated in this session.
   */
  needsPassword(handle: number): boolean {
    const { doc } = getDoc(handle);
    return doc.needsPassword();
  },

  /**
   * Authenticate the open document with the given password. Returns true
   * when the password unlocks the document for reading; false when the
   * password is incorrect. Once authenticated, the document handle can be
   * used like any other for page reads and unencrypted saves.
   */
  authenticatePassword(handle: number, password: string): boolean {
    const { doc } = getDoc(handle);
    // MuPDF returns 0 on failure, non-zero on success (with bits indicating
    // user vs. owner authentication). We collapse that to a simple boolean.
    return doc.authenticatePassword(password) !== 0;
  },

  /**
   * Save the open document with encryption stripped. Caller must have
   * authenticated the document first (via authenticatePassword); MuPDF
   * refuses to write pages from an unauthenticated encrypted document.
   */
  decryptPdf(handle: number): Uint8Array {
    const { doc } = getDoc(handle);
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("Document is not a PDF");
    const bytes = saveToTransferableBytes(pdf, {
      encrypt: "none",
      compress: true,
      garbage: true,
    });
    return Comlink.transfer(bytes, [bytes.buffer]);
  },

  /**
   * Encrypt the open document with the given password (used for both user
   * and owner password). AES-256 is the strongest cipher MuPDF supports and
   * is widely compatible with PDF 2.0 readers.
   *
   * The original document handle is not mutated — saveToBuffer writes a copy
   * with the requested encryption applied. Original metadata is preserved.
   */
  encryptPdf(handle: number, password: string): Uint8Array {
    const { doc } = getDoc(handle);
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("Document is not a PDF");
    const bytes = saveToTransferableBytes(pdf, {
      encrypt: "aes-256",
      "user-password": password,
      "owner-password": password,
      compress: true,
    });
    return Comlink.transfer(bytes, [bytes.buffer]);
  },

  /**
   * Merge pages from already-open document handles into a single PDF.
   * Pages from the same source document share resources (fonts, images)
   * automatically via MuPDF's graft deduplication.
   */
  async mergeFromHandles(
    pageSpecs: {
      handle: number;
      pageIndex: number;
      rotation: number;
      imageProcess?: ImageProcessConfig;
    }[],
    metadata?: PdfMetadata
  ): Promise<Uint8Array> {
    const mupdf = await getMupdf();
    const output = newOutputPdf(mupdf);
    try {
      if (metadata) {
        if (metadata.title) output.setMetaData("info:Title", metadata.title);
        if (metadata.author)
          output.setMetaData("info:Author", metadata.author);
        if (metadata.subject)
          output.setMetaData("info:Subject", metadata.subject);
        if (metadata.keywords)
          output.setMetaData("info:Keywords", metadata.keywords);
      }

      for (const spec of pageSpecs) {
        const { doc: sourceDoc } = getDoc(spec.handle);
        const destIndex = output.countPages();

        if (spec.imageProcess) {
          // Image-derived source — rebuild the page from the image bytes with
          // the requested resize / recompress applied. This bypasses graftPage
          // because we want a fresh page sized to the configured paper size.
          const sourcePdf = sourceDoc.asPDF();
          if (!sourcePdf) throw new Error("Image-process spec requires a PDF source");
          appendProcessedImagePage(mupdf, output, sourcePdf, spec.imageProcess);
        } else {
          output.graftPage(destIndex, sourceDoc as MupdfPDFDocument, spec.pageIndex);
        }

        // Apply rotation to the page if needed
        if (spec.rotation !== 0) {
          const pageObj = output.findPage(destIndex);
          const current = pageObj.get("Rotate")?.asNumber() ?? 0;
          const newRotation = ((current + spec.rotation) % 360 + 360) % 360;
          pageObj.put("Rotate", output.newInteger(newRotation));
        }
      }

      const bytes = saveToTransferableBytes(output, "compress");
      return Comlink.transfer(bytes, [bytes.buffer]);
    } finally {
      output.destroy();
    }
  },

  /**
   * Re-save the document with compression options applied. Optionally
   * recompresses embedded images as JPEG at the configured quality before the
   * final save.
   *
   * The original (cached) document handle isn't mutated — pages are grafted
   * into a fresh PDFDocument so image rewrites and metadata changes don't
   * affect other tools that share the same handle via the LRU cache.
   */
  async compressPdf(
    handle: number,
    config: CompressWorkerConfig
  ): Promise<Uint8Array> {
    const { doc: sourceDoc, mupdf } = getDoc(handle);
    const sourcePdf = sourceDoc.asPDF();
    if (!sourcePdf) throw new Error("Document is not a PDF");

    const output = newOutputPdf(mupdf);
    try {
      const pageCount = sourceDoc.countPages();
      for (let i = 0; i < pageCount; i++) {
        output.graftPage(i, sourcePdf, i);
      }

      if (config.imageProcess.recompress) {
        recompressAllImages(mupdf, output, config.imageProcess);
      }

      if (config.subsetFonts) {
        try {
          output.subsetFonts();
        } catch {
          // subsetFonts can fail on unusual fonts; not fatal — fall through
          // and save with whatever fonts are present.
        }
      }

      const bytes = saveToTransferableBytes(output, buildCompressSaveOptions(config));
      return Comlink.transfer(bytes, [bytes.buffer]);
    } finally {
      output.destroy();
    }
  },

  /**
   * Render a single page as it would appear after compression, so the user
   * can judge image quality before committing to the full export. Mirrors the
   * compressPdf flow but only on the requested page, then renders it to a
   * pixmap and discards the temporary document.
   */
  async renderCompressedPreview(
    handle: number,
    pageIndex: number,
    config: CompressWorkerConfig,
    dpi: number
  ): Promise<ImageData> {
    const { doc: sourceDoc, mupdf } = getDoc(handle);
    const sourcePdf = sourceDoc.asPDF();
    if (!sourcePdf) throw new Error("Document is not a PDF");

    const output = new mupdf.PDFDocument();
    try {
      output.graftPage(0, sourcePdf, pageIndex);

      if (config.imageProcess.recompress) {
        recompressAllImages(mupdf, output, config.imageProcess);
      }

      const imageData = renderPageToImageData(mupdf, output, 0, dpi);
      return Comlink.transfer(imageData, [imageData.data.buffer]);
    } finally {
      output.destroy();
    }
  },

  /**
   * Start an incremental image-page PDF build (see imagePdfAddContrastPage).
   *
   * The incremental API exists for memory reasons: exporting a rasterized
   * document used to accumulate every encoded page on the main thread before
   * a single build call. With this API only the worker-side output document
   * grows; each page's transient buffers are freed before the next call, so
   * peak main-thread memory stays flat regardless of document length.
   */
  async imagePdfBegin(): Promise<number> {
    const mupdf = await getMupdf();
    const buildId = nextBuildId++;
    imagePdfBuilds.set(buildId, newOutputPdf(mupdf));
    return buildId;
  },

  /**
   * Render one page of an open document, apply the contrast/brightness/
   * threshold filter, encode it, and append it to the build as a page at the
   * source page's natural point size.
   *
   * Everything happens inside the worker: the pixmap is rendered without an
   * alpha channel so it can be JPEG-encoded directly, and the filter mutates
   * the pixmap's sample view in place — no pixel data ever crosses the worker
   * boundary. The wizard picks the codec: JPEG for tone work, PNG when
   * thresholding (JPEG would ring around the hard black/white edges). MuPDF
   * re-emits each image into its native PDF filter (DCTDecode for JPEG,
   * FlateDecode for PNG).
   */
  imagePdfAddContrastPage(
    buildId: number,
    handle: number,
    pageIndex: number,
    dpi: number,
    config: ContrastConfig,
    encoding: { format: "png" } | { format: "jpeg"; quality: number }
  ): void {
    const output = getBuild(buildId);
    const { doc, mupdf } = getDoc(handle);

    // The page is laid out at its natural size in points.
    const page = doc.loadPage(pageIndex);
    let widthPt: number;
    let heightPt: number;
    try {
      const b = page.getBounds();
      widthPt = b[2] - b[0];
      heightPt = b[3] - b[1];
    } finally {
      page.destroy();
    }

    const pixmap = renderToPixmap(mupdf, doc, pageIndex, dpi, 0, /* alpha */ false);
    let encoded: Uint8Array;
    try {
      // getPixels() is a live view into the WASM heap; mutating it filters
      // the pixmap in place without copying the samples. The pixmap is
      // DeviceRGB without alpha, so samples are packed 3 bytes per pixel.
      applyContrastToPixels(pixmap.getPixels(), config, 3);
      encoded =
        encoding.format === "png" ? pixmap.asPNG() : pixmap.asJPEG(encoding.quality);
    } finally {
      pixmap.destroy();
    }

    const img = new mupdf.Image(encoded);
    try {
      addImagePage(output, img, widthPt, heightPt);
    } finally {
      img.destroy();
    }
  },

  /** Save the finished build and discard it. */
  imagePdfFinish(buildId: number): Uint8Array {
    const output = getBuild(buildId);
    try {
      const bytes = saveToTransferableBytes(output, {
        compress: true,
        "compress-images": false, // pages carry their own JPEG/PNG encoding
        garbage: "deduplicate",
        sanitize: true,
      });
      return Comlink.transfer(bytes, [bytes.buffer]);
    } finally {
      output.destroy();
      imagePdfBuilds.delete(buildId);
    }
  },

  /**
   * Discard an in-progress build. Safe to call after imagePdfFinish (or with
   * an unknown id) — it only destroys builds that are still registered, so
   * callers can put it in a finally block unconditionally.
   */
  imagePdfAbort(buildId: number): void {
    const output = imagePdfBuilds.get(buildId);
    if (output) {
      output.destroy();
      imagePdfBuilds.delete(buildId);
    }
  },
};

export type MupdfWorkerApi = typeof api;

// Expose immediately so Comlink can receive messages while WASM loads.
// Methods that need mupdf call getMupdf() internally.
Comlink.expose(api);
