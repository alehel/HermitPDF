// "Exact" engine: render the document with the browser itself and embed the
// result as one image per PDF page. The final DOM (after the applicable
// passes) is serialized into an SVG <foreignObject> snapshot — a vector
// image the browser rasterizes on demand — then sliced into pages, looking
// for a visually quiet row near each boundary so cuts avoid slicing text
// lines. Link geometry is read from the live DOM so hyperlinks stay
// clickable in the image PDF. Pixel-perfect CSS at the cost of selectable
// text. Main-thread only.

import {
  contentWidthCssPx,
  type ExactPdfLink,
  type HtmlLayoutOptions,
} from "./htmlToPdf";
import {
  buildSrcdoc,
  hoistConditionalCss,
  removeFixedElements,
  settleImages,
  stripSideWhitespace,
} from "./lowerHtml";

const LOAD_TIMEOUT_MS = 6000;
const TARGET_DPI = 150;
const JPEG_QUALITY = 0.9;
const MAX_DOC_CSS_HEIGHT = 60000;
const MAX_PAGES = 200;
/** How far above the ideal cut to look for a visually quiet row (CSS px). */
const BREAK_SEARCH_CSS = 56;
const MM_TO_PT = 72 / 25.4;
const MAX_CROP_MM = 50;

export interface ExactCropMm {
  /** Trimmed off both left and right of the rendered page. */
  sides: number;
  top: number;
  bottom: number;
}

export interface ExactCaptureOptions {
  printStyles: boolean;
  fullWidth: boolean;
  cropMm: ExactCropMm;
}

export interface ExactCapture {
  pageCount: number;
  /** Full page (content + white margins) at the given pixel width. */
  renderPage(pageIndex: number, targetWidthPx: number): ImageData;
  /** One JPEG per page at ~150 DPI, ready for the worker. */
  encodePages(): Promise<Uint8Array<ArrayBuffer>[]>;
  links(): ExactPdfLink[];
}

interface RawLink {
  rects: { x: number; y: number; w: number; h: number }[];
  uri: string;
  external: boolean;
  targetY?: number;
}

export async function buildExactCapture(
  html: string,
  layout: HtmlLayoutOptions,
  opts: ExactCaptureOptions
): Promise<ExactCapture> {
  const viewportPx = contentWidthCssPx(layout);
  const m = layout.marginsPt;
  const contentWPt = layout.pageWidthPt - m.left - m.right;
  const contentHPt = layout.pageHeightPt - m.top - m.bottom;

  // ---- render in the hardened iframe and measure ----
  const iframe = document.createElement("iframe");
  let serialized: string;
  let docHeightCss: number;
  const rawLinks: RawLink[] = [];
  try {
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;border:0;width:${Math.max(50, Math.round(viewportPx))}px;height:2000px;`;
    iframe.srcdoc = buildSrcdoc(html);
    const loaded = new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      setTimeout(() => reject(new Error("exact capture iframe load timeout")), LOAD_TIMEOUT_MS);
    });
    document.body.appendChild(iframe);
    await loaded;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!doc || !win || !doc.body) throw new Error("exact capture iframe has no document");
    await settleImages(doc);

    // The browser applies @media/@supports natively here, so hoisting is
    // only needed to *emulate print*. Fixed chrome would pin to the hidden
    // iframe viewport and smear over the capture top — always drop it.
    if (opts.printStyles) hoistConditionalCss(doc, win, true);
    removeFixedElements(doc, win);
    if (opts.fullWidth) stripSideWhitespace(doc, win);

    docHeightCss = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      1
    );
    if (docHeightCss > MAX_DOC_CSS_HEIGHT) {
      throw new Error("document too tall for exact mode");
    }

    // Link geometry in document CSS-pixel space (iframe never scrolls, so
    // client rects are document coordinates).
    for (const a of doc.body.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = a.getAttribute("href");
      if (!href) continue;
      let external = true;
      let targetY: number | undefined;
      if (href.startsWith("#")) {
        const id = decodeURIComponent(href.slice(1));
        const target =
          doc.getElementById(id) ??
          doc.querySelector(`a[name="${CSS.escape(id)}"]`);
        if (!target) continue;
        external = false;
        targetY = target.getBoundingClientRect().top;
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        continue; // unresolved relative URL — nothing useful to link to
      }
      const rects = [...a.getClientRects()]
        .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }))
        .filter((r) => r.w > 0 && r.h > 0);
      if (rects.length) rawLinks.push({ rects, uri: href, external, targetY });
    }

    // foreignObject content must be namespaced XHTML to render.
    doc.documentElement.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    serialized = new XMLSerializer().serializeToString(doc.documentElement);
  } finally {
    iframe.remove();
  }

  // ---- vector snapshot: rasterized lazily by each drawImage call ----
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(viewportPx)}" height="${Math.ceil(docHeightCss)}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const snapshot = new Image();
  await new Promise<void>((resolve, reject) => {
    snapshot.onload = () => resolve();
    snapshot.onerror = () => reject(new Error("exact capture rasterization failed"));
    snapshot.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  // ---- crop + pagination geometry (all in CSS px of the snapshot) ----
  const clampCrop = (mm: number) =>
    Math.min(MAX_CROP_MM, Math.max(0, Number.isFinite(mm) ? mm : 0));
  const prePtPerCss = contentWPt / viewportPx;
  const cropSideCss = (clampCrop(opts.cropMm.sides) * MM_TO_PT) / prePtPerCss;
  const cropTopCss = (clampCrop(opts.cropMm.top) * MM_TO_PT) / prePtPerCss;
  const cropBottomCss = (clampCrop(opts.cropMm.bottom) * MM_TO_PT) / prePtPerCss;
  const croppedW = Math.max(50, viewportPx - 2 * cropSideCss);
  const ptPerCss = contentWPt / croppedW;
  const pageHCss = contentHPt / ptPerCss;
  const stripTop = Math.min(cropTopCss, Math.max(0, docHeightCss - 10));
  const stripBottom = Math.max(stripTop + 10, docHeightCss - cropBottomCss);

  const boundaries = computeBoundaries(
    snapshot,
    cropSideCss,
    croppedW,
    stripTop,
    stripBottom,
    pageHCss
  );
  const pageCount = boundaries.length - 1;
  if (pageCount > MAX_PAGES) throw new Error("too many pages for exact mode");

  const drawPage = (
    pageIndex: number,
    scalePxPerPt: number,
    ctx: CanvasRenderingContext2D
  ) => {
    const sliceTop = boundaries[pageIndex];
    const sliceH = Math.min(boundaries[pageIndex + 1] - sliceTop, pageHCss);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(
      snapshot,
      cropSideCss,
      sliceTop,
      croppedW,
      sliceH,
      m.left * scalePxPerPt,
      m.top * scalePxPerPt,
      contentWPt * scalePxPerPt,
      sliceH * ptPerCss * scalePxPerPt
    );
  };

  return {
    pageCount,

    renderPage(pageIndex, targetWidthPx) {
      const index = Math.max(0, Math.min(pageIndex, pageCount - 1));
      const scale = targetWidthPx / layout.pageWidthPt;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(layout.pageWidthPt * scale));
      canvas.height = Math.max(1, Math.round(layout.pageHeightPt * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      drawPage(index, scale, ctx);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },

    async encodePages() {
      const pages: Uint8Array<ArrayBuffer>[] = [];
      const scale = TARGET_DPI / 72; // canvas px per pt → 150 DPI on paper
      for (let i = 0; i < pageCount; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(contentWPt * scale));
        canvas.height = Math.max(1, Math.round(contentHPt * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        // Content box only — the worker places it inside the margins.
        const sliceTop = boundaries[i];
        const sliceH = Math.min(boundaries[i + 1] - sliceTop, pageHCss);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          snapshot,
          cropSideCss,
          sliceTop,
          croppedW,
          sliceH,
          0,
          0,
          canvas.width,
          Math.round(sliceH * ptPerCss * scale)
        );
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
        );
        if (!blob) throw new Error("page encoding failed");
        pages.push(new Uint8Array(await blob.arrayBuffer()));
      }
      return pages;
    },

    links() {
      const pageOf = (y: number) => {
        if (y < stripTop || y >= stripBottom) return -1;
        for (let i = 0; i < pageCount; i++) {
          if (y < boundaries[i + 1]) return i;
        }
        return pageCount - 1;
      };
      const out: ExactPdfLink[] = [];
      for (const link of rawLinks) {
        let destPage: number | undefined;
        let destY: number | undefined;
        if (!link.external) {
          const page = pageOf(Math.max(stripTop, link.targetY ?? 0));
          if (page < 0) continue;
          destPage = page;
          destY = m.top + (Math.max(stripTop, link.targetY ?? 0) - boundaries[page]) * ptPerCss;
        }
        for (const r of link.rects) {
          const page = pageOf(r.y + r.h / 2);
          if (page < 0) continue;
          const clampX = (v: number) =>
            Math.min(m.left + contentWPt, Math.max(m.left, v));
          const x0 = clampX(m.left + (r.x - cropSideCss) * ptPerCss);
          const x1 = clampX(m.left + (r.x + r.w - cropSideCss) * ptPerCss);
          if (x1 - x0 < 1) continue;
          const y0 = m.top + (r.y - boundaries[page]) * ptPerCss;
          out.push({
            pageIndex: page,
            rect: [x0, y0, x1, y0 + r.h * ptPerCss],
            uri: link.uri,
            external: link.external,
            destPage,
            destX: destPage === undefined ? undefined : m.left,
            destY,
          });
        }
      }
      return out;
    },
  };
}

/**
 * Fixed-height slicing cuts text lines in half; look up to BREAK_SEARCH_CSS
 * above each ideal cut for a visually uniform pixel row (line gap, section
 * boundary) and cut there instead. Falls back to the hard cut when no quiet
 * row exists or moving up would waste more than 40% of the page.
 */
function computeBoundaries(
  snapshot: HTMLImageElement,
  cropX: number,
  croppedW: number,
  top: number,
  bottom: number,
  pageHCss: number
): number[] {
  const boundaries = [top];
  const sampleW = Math.max(50, Math.min(360, Math.round(croppedW / 3)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = BREAK_SEARCH_CSS;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let cursor = top;
  while (bottom - cursor > pageHCss + 1) {
    let cut = cursor + pageHCss;
    if (ctx) {
      try {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sampleW, BREAK_SEARCH_CSS);
        ctx.drawImage(
          snapshot,
          cropX,
          cut - BREAK_SEARCH_CSS,
          croppedW,
          BREAK_SEARCH_CSS,
          0,
          0,
          sampleW,
          BREAK_SEARCH_CSS
        );
        const data = ctx.getImageData(0, 0, sampleW, BREAK_SEARCH_CSS).data;
        for (let dy = 0; dy < BREAK_SEARCH_CSS; dy++) {
          const row = BREAK_SEARCH_CSS - 1 - dy;
          const base = row * sampleW * 4;
          const r0 = data[base];
          const g0 = data[base + 1];
          const b0 = data[base + 2];
          let uniform = true;
          for (let x = 1; x < sampleW; x++) {
            const o = base + x * 4;
            if (
              Math.abs(data[o] - r0) > 8 ||
              Math.abs(data[o + 1] - g0) > 8 ||
              Math.abs(data[o + 2] - b0) > 8
            ) {
              uniform = false;
              break;
            }
          }
          if (uniform) {
            const candidate = cut - dy;
            if (candidate - cursor >= pageHCss * 0.6) cut = candidate;
            break;
          }
        }
      } catch {
        // analysis failure — keep the hard cut
      }
    }
    boundaries.push(cut);
    cursor = cut;
  }
  boundaries.push(bottom);
  return boundaries;
}
