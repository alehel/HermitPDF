/* eslint-disable no-var */
declare var $libmupdf_wasm_Module: unknown;

import * as Comlink from "comlink";
import type { BatesPosition, ExtractedImage } from "@/lib/types";
import {
  formatBatesNumber,
  computeShrinkTransform,
  computeShrinkMargin,
  computeStampPosition,
  getQuadding,
} from "@/lib/batesStamp";

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
  recompressImages: boolean;
  imageQuality: number;
  subsetFonts: boolean;
  deduplicateObjects: boolean;
  sanitizeStreams: boolean;
};

// Aliases for MuPDF runtime instance types so signatures stay readable.
type MupdfDocument = InstanceType<(typeof import("mupdf"))["Document"]>;
type MupdfPDFDocument = InstanceType<(typeof import("mupdf"))["PDFDocument"]>;
type MupdfPDFObject = InstanceType<(typeof import("mupdf"))["PDFObject"]>;

// Lazy-load mupdf WASM — initialized on first use, not at module load time.
// This lets Comlink.expose() run immediately so messages aren't lost.
let mupdfModule: typeof import("mupdf") | null = null;
let mupdfLoading: Promise<typeof import("mupdf")> | null = null;

async function getMupdf(): Promise<typeof import("mupdf")> {
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
const documents = new Map<number, { doc: InstanceType<(typeof import("mupdf"))["Document"]>; mupdf: typeof import("mupdf") }>();

function getDoc(handle: number) {
  const entry = documents.get(handle);
  if (!entry) throw new Error(`No document for handle ${handle}`);
  return entry;
}

/**
 * Build the scale + rotation matrix for a page, normalized to a (0,0) origin.
 * Shared by renderToPixmap (which also needs the bbox) and buildRenderMatrix.
 */
function buildPageMatrix(
  mupdf: typeof import("mupdf"),
  doc: InstanceType<typeof mupdf.Document>,
  pageIndex: number,
  dpi: number,
  rotation: number = 0
): {
  matrix: [number, number, number, number, number, number];
  normalizedBbox: [number, number, number, number];
} {
  const zoom = dpi / 72;
  const page = doc.loadPage(pageIndex);
  try {
    const bounds = page.getBounds();
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
  } finally {
    page.destroy();
  }
}

/**
 * Render a page to a white-backgrounded RGBA pixmap using DrawDevice.
 *
 * Supports rotation (0, 90, 180, 270) applied via the transformation matrix.
 *
 * Each WASM object (page, pixmap, device) must be explicitly destroyed
 * to free native memory — the JS GC won't reclaim it. The nested
 * try/finally blocks ensure cleanup even when rendering throws.
 */
function renderToPixmap(
  mupdf: typeof import("mupdf"),
  doc: InstanceType<typeof mupdf.Document>,
  pageIndex: number,
  dpi: number,
  rotation: number = 0
): InstanceType<typeof mupdf.Pixmap> {
  const { matrix, normalizedBbox } = buildPageMatrix(mupdf, doc, pageIndex, dpi, rotation);

  const page = doc.loadPage(pageIndex);
  try {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, normalizedBbox, true);
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
 * Build the rendering matrix for a page at a given DPI and rotation.
 * Used by getImagePositions to map image bboxes to canvas coordinates.
 */
function buildRenderMatrix(
  mupdf: typeof import("mupdf"),
  doc: InstanceType<typeof mupdf.Document>,
  pageIndex: number,
  dpi: number,
  rotation: number = 0
): { matrix: [number, number, number, number, number, number] } {
  return buildPageMatrix(mupdf, doc, pageIndex, dpi, rotation);
}

/**
 * Transform a rect through a matrix. MuPDF's Rect.transform works on
 * axis-aligned rects; for image bboxes from the walker we transform
 * the four corners and take the axis-aligned bounding box.
 */
function transformRect(
  mupdf: typeof import("mupdf"),
  rect: [number, number, number, number],
  matrix: [number, number, number, number, number, number]
): [number, number, number, number] {
  return mupdf.Rect.transform(rect, matrix);
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
      pushImage(pixmap.asPNG().slice(), "image/png", "png");
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
              const data = pixmap.asPNG().slice();

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
  mupdf: typeof import("mupdf"),
  pdf: MupdfPDFDocument,
  xobj: MupdfPDFObject,
  seen: Set<number>,
  quality: number
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

  // ImageMasks are 1-bit stencils; recompressing as JPEG would silently
  // produce an opaque rectangle. Mask/SMask images participate in alpha or
  // stencil compositing with another image; we can't safely replace just one
  // half of the pair without recompressing both in lockstep.
  const imageMaskObj = xobj.get("ImageMask");
  if (imageMaskObj.isBoolean() && imageMaskObj.asBoolean()) return;
  if (!xobj.get("SMask").isNull()) return;
  if (!xobj.get("Mask").isNull()) return;

  let image: InstanceType<typeof mupdf.Image> | null = null;
  try {
    image = pdf.loadImage(xobj);
  } catch {
    return;
  }

  try {
    const pixmap = image.toPixmap();
    let pixmapForJpeg = pixmap;
    let createdRgbCopy = false;
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

      const finalComponents = pixmapForJpeg.getNumberOfComponents();
      const outputColorSpace = finalComponents === 1 ? "DeviceGray" : "DeviceRGB";

      const jpegBytes = pixmapForJpeg.asJPEG(quality).slice();

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
      if (createdRgbCopy) pixmapForJpeg.destroy();
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
  mupdf: typeof import("mupdf"),
  pdf: MupdfPDFDocument,
  resources: MupdfPDFObject,
  seen: Set<number>,
  quality: number
): void {
  if (resources.isNull()) return;
  const xobjs = resources.get("XObject");
  if (xobjs.isNull() || !xobjs.isDictionary()) return;

  xobjs.forEach((val) => {
    const subtype = val.get("Subtype");
    if (!subtype.isName()) return;
    const subtypeName = subtype.asName();
    if (subtypeName === "Image") {
      recompressImageXObject(mupdf, pdf, val, seen, quality);
    } else if (subtypeName === "Form") {
      walkResourcesForRecompression(mupdf, pdf, val.get("Resources"), seen, quality);
    }
  });
}

/**
 * Recompress every Image XObject reachable from the document's pages.
 * Modifies the PDFDocument in place.
 */
function recompressAllImages(
  mupdf: typeof import("mupdf"),
  pdf: MupdfPDFDocument,
  quality: number
): void {
  const seen = new Set<number>();
  const pageCount = pdf.countPages();
  for (let i = 0; i < pageCount; i++) {
    const pageObj = pdf.findPage(i);
    const resources = pageObj.getInheritable("Resources");
    walkResourcesForRecompression(mupdf, pdf, resources, seen, quality);
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

function imageToPdf(
  mupdf: typeof import("mupdf"),
  data: ArrayBuffer
): MupdfPDFDocument {
  const img = new mupdf.Image(data);
  const xRes = img.getXResolution() || 72;
  const yRes = img.getYResolution() || 72;
  const w = (img.getWidth() / xRes) * 72;
  const h = (img.getHeight() / yRes) * 72;

  const pdf = new mupdf.PDFDocument();
  const imgRef = pdf.addImage(img);
  img.destroy();

  const resources = pdf.addObject(
    pdf.newDictionary()
  );
  const xobjects = pdf.newDictionary();
  xobjects.put("Img", imgRef);
  resources.put("XObject", xobjects);

  const contents = `q ${w} 0 0 ${h} 0 0 cm /Img Do Q`;
  const pageObj = pdf.addPage([0, 0, w, h], 0, resources, contents);
  pdf.insertPage(-1, pageObj);

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
    const pixmap = renderToPixmap(mupdf, doc, pageIndex, dpi, rotation);
    const imageData = new ImageData(
      pixmap.getPixels().slice(),
      pixmap.getWidth(),
      pixmap.getHeight()
    );
    pixmap.destroy();
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
    const pngBytes = pixmap.asPNG();
    pixmap.destroy();

    const data = pngBytes.slice();
    return Comlink.transfer({ pngData: data, aspectRatio }, [data.buffer]);
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
  ): { imageIndex: number; bbox: [number, number, number, number]; width: number; height: number }[] {
    const { doc, mupdf } = getDoc(handle);
    const { matrix } = buildRenderMatrix(mupdf, doc, pageIndex, dpi, rotation);

    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        const positions: { imageIndex: number; bbox: [number, number, number, number]; width: number; height: number }[] = [];
        let imgIdx = 0;
        stext.walk({
          onImageBlock(bbox, _transform, image) {
            const w = image.getWidth();
            const h = image.getHeight();
            if (w < 10 || h < 10) return;
            const transformed = transformRect(mupdf, bbox, matrix);
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
    const { doc } = getDoc(handle);
    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        let imgIdx = 0;
        let result: { width: number; height: number; data: Uint8Array; mimeType: string; extension: string } | null = null;
        stext.walk({
          onImageBlock(_bbox, _transform, image) {
            if (result) return; // already found
            const w = image.getWidth();
            const h = image.getHeight();
            if (w < 10 || h < 10) return;
            if (imgIdx++ !== imageIndex) return;

            const pixmap = image.toPixmap();
            try {
              const pngBytes = pixmap.asPNG();
              const data = pngBytes.slice();
              result = { width: w, height: h, data, mimeType: "image/png", extension: "png" };
            } finally {
              pixmap.destroy();
            }
          },
        });
        if (result) {
          return Comlink.transfer(result, [(result as { data: Uint8Array }).data.buffer]);
        }
        return null;
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
    const output = new mupdf.PDFDocument();
    try {
      output.setMetaData("info:Creator", "hermitpdf.eu");
      output.setMetaData("info:Producer", "hermitpdf.eu");

      const pageCount = sourceDoc.countPages();
      for (let i = 0; i < pageCount; i++) {
        output.graftPage(i, sourceDoc as InstanceType<typeof mupdf.PDFDocument>, i);
      }

      // Add a Helvetica font for the stamp
      const font = new mupdf.Font("Helvetica");

      for (let i = 0; i < pageCount; i++) {
        const batesText = formatBatesNumber(config.prefix, config.startNumber + i, config.digits);

        // Get page dimensions from the page object
        const pageObj = output.findPage(i);
        const mediaBox = pageObj.get("MediaBox");
        const pageWidth = mediaBox.get(2).asNumber() - mediaBox.get(0).asNumber();
        const pageHeight = mediaBox.get(3).asNumber() - mediaBox.get(1).asNumber();

        // Handle shrink mode: wrap existing content stream with scale matrix
        if (config.shrink) {
          const transform = computeShrinkTransform(pageWidth, pageHeight, config.position, config.fontSize, config.padding);
          const contentsObj = pageObj.get("Contents");

          if (!contentsObj.isNull()) {
            let originalStream = "";
            try {
              if (contentsObj.isArray()) {
                const parts: string[] = [];
                for (let s = 0; s < contentsObj.length; s++) {
                  parts.push(contentsObj.get(s).readStream().asString());
                }
                originalStream = parts.join("\n");
              } else {
                originalStream = contentsObj.readStream().asString();
              }
            } catch {
              // Stream data may not be directly readable on grafted pages;
              // fall through and skip shrink for this page.
            }

            if (originalStream) {
              const wrappedStream =
                `q ${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f} cm\n` +
                originalStream +
                "\nQ\n";

              // Create a new stream object for the wrapped content
              const newStreamObj = output.addStream(wrappedStream, {});
              pageObj.put("Contents", newStreamObj);
            }
          }
        }

        // Add FreeText annotation for the Bates stamp
        const page = output.loadPage(i) as InstanceType<typeof mupdf.PDFPage>;
        try {
          const annot = page.createAnnotation("FreeText");
          const pos = computeStampPosition(pageWidth, pageHeight, config.position, config.fontSize, config.padding);
          const quadding = getQuadding(config.position);

          // Set annotation rect — width covers most of the page for alignment to work
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

      // Bake annotations into page content so stamps are permanent
      output.bake(true, false);
      font.destroy();

      const buf = output.saveToBuffer("compress");
      const bytes = buf.asUint8Array().slice();
      buf.destroy();
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
      // Graft just the one page
      output.graftPage(0, sourceDoc as InstanceType<typeof mupdf.PDFDocument>, pageIndex);

      const font = new mupdf.Font("Helvetica");
      const batesText = formatBatesNumber(config.prefix, config.startNumber, config.digits);

      const pageObj = output.findPage(0);
      const mediaBox = pageObj.get("MediaBox");
      const pageWidth = mediaBox.get(2).asNumber() - mediaBox.get(0).asNumber();
      const pageHeight = mediaBox.get(3).asNumber() - mediaBox.get(1).asNumber();

      if (config.shrink) {
        const transform = computeShrinkTransform(pageWidth, pageHeight, config.position, config.fontSize, config.padding);
        const contentsObj = pageObj.get("Contents");

        if (!contentsObj.isNull()) {
          let originalStream = "";
          try {
            if (contentsObj.isArray()) {
              const parts: string[] = [];
              for (let s = 0; s < contentsObj.length; s++) {
                parts.push(contentsObj.get(s).readStream().asString());
              }
              originalStream = parts.join("\n");
            } else {
              originalStream = contentsObj.readStream().asString();
            }
          } catch {
            // Stream data may not be directly readable on grafted pages;
            // fall through and skip shrink for this page.
          }

          if (originalStream) {
            const wrappedStream =
              `q ${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f} cm\n` +
              originalStream +
              "\nQ\n";

            const newStreamObj = output.addStream(wrappedStream, {});
            pageObj.put("Contents", newStreamObj);
          }
        }
      }

      const page = output.loadPage(0) as InstanceType<typeof mupdf.PDFPage>;
      try {
        const annot = page.createAnnotation("FreeText");
        const pos = computeStampPosition(pageWidth, pageHeight, config.position, config.fontSize, config.padding);
        const quadding = getQuadding(config.position);

        const rectHeight = config.fontSize + config.padding;
        let rectX0: number, rectX1: number;
        if (quadding === 0) {
          rectX0 = pos.x;
          rectX1 = pageWidth - config.padding;
        } else if (quadding === 2) {
          rectX0 = config.padding;
          rectX1 = pos.x;
        } else {
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

      output.bake(true, false);

      // Render the stamped page
      const { matrix, normalizedBbox } = buildPageMatrix(mupdf, output, 0, dpi, 0);
      const renderPage = output.loadPage(0);
      try {
        const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, normalizedBbox, true);
        try {
          pixmap.clear(255);
          const device = new mupdf.DrawDevice(matrix, pixmap);
          try {
            renderPage.run(device, mupdf.Matrix.identity);
            device.close();
          } finally {
            device.destroy();
          }
          const imageData = new ImageData(
            pixmap.getPixels().slice(),
            pixmap.getWidth(),
            pixmap.getHeight()
          );
          return Comlink.transfer(imageData, [imageData.data.buffer]);
        } finally {
          pixmap.destroy();
        }
      } finally {
        renderPage.destroy();
        font.destroy();
      }
    } finally {
      output.destroy();
    }
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
    const buf = pdf.saveToBuffer({
      encrypt: "none",
      compress: true,
      garbage: true,
    });
    const bytes = buf.asUint8Array().slice();
    buf.destroy();
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
    const buf = pdf.saveToBuffer({
      encrypt: "aes-256",
      "user-password": password,
      "owner-password": password,
      compress: true,
    });
    const bytes = buf.asUint8Array().slice();
    buf.destroy();
    return Comlink.transfer(bytes, [bytes.buffer]);
  },

  /**
   * Merge pages from already-open document handles into a single PDF.
   * Pages from the same source document share resources (fonts, images)
   * automatically via MuPDF's graft deduplication.
   */
  async mergeFromHandles(
    pageSpecs: { handle: number; pageIndex: number; rotation: number }[],
    metadata?: PdfMetadata
  ): Promise<Uint8Array> {
    const mupdf = await getMupdf();
    const output = new mupdf.PDFDocument();
    try {
      output.setMetaData("info:Creator", "hermitpdf.eu");
      output.setMetaData("info:Producer", "hermitpdf.eu");

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
        output.graftPage(destIndex, sourceDoc as InstanceType<typeof mupdf.PDFDocument>, spec.pageIndex);

        // Apply rotation to the grafted page if needed
        if (spec.rotation !== 0) {
          const pageObj = output.findPage(destIndex);
          const current = pageObj.get("Rotate")?.asNumber() ?? 0;
          const newRotation = ((current + spec.rotation) % 360 + 360) % 360;
          pageObj.put("Rotate", output.newInteger(newRotation));
        }
      }

      const buf = output.saveToBuffer("compress");
      const bytes = buf.asUint8Array().slice();
      buf.destroy();
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

    const output = new mupdf.PDFDocument();
    try {
      output.setMetaData("info:Creator", "hermitpdf.eu");
      output.setMetaData("info:Producer", "hermitpdf.eu");

      const pageCount = sourceDoc.countPages();
      for (let i = 0; i < pageCount; i++) {
        output.graftPage(i, sourcePdf, i);
      }

      if (config.recompressImages) {
        recompressAllImages(mupdf, output, config.imageQuality);
      }

      if (config.subsetFonts) {
        try {
          output.subsetFonts();
        } catch {
          // subsetFonts can fail on unusual fonts; not fatal — fall through
          // and save with whatever fonts are present.
        }
      }

      const buf = output.saveToBuffer(buildCompressSaveOptions(config));
      const bytes = buf.asUint8Array().slice();
      buf.destroy();
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

      if (config.recompressImages) {
        recompressAllImages(mupdf, output, config.imageQuality);
      }

      const { matrix, normalizedBbox } = buildPageMatrix(mupdf, output, 0, dpi, 0);
      const page = output.loadPage(0);
      try {
        const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, normalizedBbox, true);
        try {
          pixmap.clear(255);
          const device = new mupdf.DrawDevice(matrix, pixmap);
          try {
            page.run(device, mupdf.Matrix.identity);
            device.close();
          } finally {
            device.destroy();
          }
          const imageData = new ImageData(
            pixmap.getPixels().slice(),
            pixmap.getWidth(),
            pixmap.getHeight()
          );
          return Comlink.transfer(imageData, [imageData.data.buffer]);
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    } finally {
      output.destroy();
    }
  },
};

export type MupdfWorkerApi = typeof api;

// Expose immediately so Comlink can receive messages while WASM loads.
// Methods that need mupdf call getMupdf() internally.
Comlink.expose(api);
