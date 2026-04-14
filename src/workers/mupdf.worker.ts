/* eslint-disable no-var */
declare var $libmupdf_wasm_Module: unknown;

import * as Comlink from "comlink";

type PdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
};

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

const api = {
  async openDocument(data: ArrayBuffer): Promise<number> {
    const mupdf = await getMupdf();
    const doc = mupdf.Document.openDocument(data, "application/pdf");
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
   * Deduplicates by image dimensions + first 32 bytes of PNG data.
   * Skips tiny images (< 10x10 px) that are likely decorative.
   */
  extractImages(
    handle: number,
    pageIndices: number[]
  ): { images: { pageIndex: number; imageIndex: number; width: number; height: number; pngData: Uint8Array }[] } {
    const { doc, mupdf } = getDoc(handle);
    const seen = new Set<string>();
    const images: { pageIndex: number; imageIndex: number; width: number; height: number; pngData: Uint8Array }[] = [];
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
              if (w < 10 || h < 10) return; // skip decorative

              const pixmap = image.toPixmap();
              try {
                const pngBytes = pixmap.asPNG();
                const data = pngBytes.slice();

                // Deduplicate by dimensions + first 32 bytes
                const prefix = data.slice(0, 32);
                const key = `${w}x${h}:${Array.from(prefix).map(b => b.toString(16).padStart(2, "0")).join("")}`;
                if (seen.has(key)) return;
                seen.add(key);

                images.push({ pageIndex, imageIndex: imgIdx++, width: w, height: h, pngData: data });
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
   * Extract a single image by index from a page.
   */
  extractSingleImage(
    handle: number,
    pageIndex: number,
    imageIndex: number
  ): { width: number; height: number; pngData: Uint8Array } | null {
    const { doc } = getDoc(handle);
    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("preserve-images");
      try {
        let imgIdx = 0;
        let result: { width: number; height: number; pngData: Uint8Array } | null = null;
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
              result = { width: w, height: h, pngData: data };
            } finally {
              pixmap.destroy();
            }
          },
        });
        if (result) {
          return Comlink.transfer(result, [(result as { pngData: Uint8Array }).pngData.buffer]);
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
};

export type MupdfWorkerApi = typeof api;

// Expose immediately so Comlink can receive messages while WASM loads.
// Methods that need mupdf call getMupdf() internally.
Comlink.expose(api);
