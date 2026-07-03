import { pageSizeInPoints, type PageSizeKey } from "./imageResize";

// Shared types/constants for the HTML → PDF wizard. Imported by the wizard,
// the mupdf client, and the worker — keep it free of DOM-only APIs.

export type HtmlPageSizeKey = Exclude<PageSizeKey, "Original">;
export const HTML_PAGE_SIZE_KEYS: HtmlPageSizeKey[] = ["A4", "Letter", "Legal", "A5", "A3"];

export type HtmlOrientation = "portrait" | "landscape";
export const HTML_ORIENTATIONS: HtmlOrientation[] = ["portrait", "landscape"];

export type HtmlMarginPreset = "none" | "small" | "normal" | "large";
export type HtmlMarginSetting = HtmlMarginPreset | "custom";
export const HTML_MARGIN_SETTINGS: HtmlMarginSetting[] = [
  "none",
  "small",
  "normal",
  "large",
  "custom",
];
export const PRESET_MARGIN_MM: Record<HtmlMarginPreset, number> = {
  none: 0,
  small: 10,
  normal: 20,
  large: 30,
};
const PT_PER_MM = 72 / 25.4;

/** Per-side margins in millimetres, as edited in the UI. */
export interface MarginBoxMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Per-side cap. 50mm on every side of the smallest page (A5, 148mm short
 * edge) still leaves a 48mm content box, so clamped margins can never
 * produce an empty layout.
 */
export const MAX_MARGIN_MM = 50;

export function uniformMarginsMm(mm: number): MarginBoxMm {
  return { top: mm, right: mm, bottom: mm, left: mm };
}

export const MIN_ZOOM_PERCENT = 50;
export const MAX_ZOOM_PERCENT = 200;

/**
 * Base font size handed to mupdf's layout() for text with no explicit size.
 * 12pt ≡ the 16px browser default, so 100% zoom matches what a browser shows.
 */
const LAYOUT_EM_PT = 12;

/** Wizard-facing settings state. */
export interface HtmlToPdfConfig {
  pageSize: HtmlPageSizeKey;
  orientation: HtmlOrientation;
  margin: HtmlMarginSetting;
  /** Per-side values used when margin === "custom". */
  customMarginsMm: MarginBoxMm;
  /**
   * Browser-style page zoom in percent (Ctrl+/Ctrl-): the page is laid out
   * at contentWidth ÷ zoom and drawn scaled by zoom, so explicit px sizes,
   * boxes, and images all grow or shrink together.
   */
  zoom: number;
  keepLinks: boolean;
  /** Rewrite flex/grid layouts with the browser engine before converting. */
  adaptLayout: boolean;
  /** Expand centered content columns to the full page width. */
  stripWhitespace: boolean;
}

export const DEFAULT_HTML_TO_PDF_CONFIG: HtmlToPdfConfig = {
  pageSize: "A4",
  orientation: "portrait",
  margin: "normal",
  customMarginsMm: uniformMarginsMm(PRESET_MARGIN_MM.normal),
  zoom: 100,
  keepLinks: true,
  adaptLayout: true,
  stripWhitespace: false,
};

/** Per-side margins in points, crossing the worker boundary. */
export interface MarginBoxPt {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Resolved geometry crossing the worker boundary. All lengths in points. */
export interface HtmlLayoutOptions {
  pageWidthPt: number;
  pageHeightPt: number;
  marginsPt: MarginBoxPt;
  emSize: number;
  /** Content scale factor (zoom ÷ 100): layout at size ÷ scale, draw × scale. */
  scale: number;
  keepLinks: boolean;
  /** PDF info:Title, extracted from the HTML <title> on the main thread. */
  title?: string;
  /**
   * Address the HTML was fetched from, when it came from a URL. Relative
   * hrefs in the page are resolved against it so they stay clickable.
   */
  baseUrl?: string;
}

export function resolveLayoutOptions(
  config: HtmlToPdfConfig,
  title?: string,
  baseUrl?: string
): HtmlLayoutOptions {
  const { shortPt, longPt } = pageSizeInPoints(config.pageSize);
  const portrait = config.orientation === "portrait";
  const mm =
    config.margin === "custom"
      ? config.customMarginsMm
      : uniformMarginsMm(PRESET_MARGIN_MM[config.margin]);
  // Clamp to [0, MAX_MARGIN_MM] so hand-typed values can never leave the
  // layout with an empty content box (see MAX_MARGIN_MM).
  const clamp = (v: number) =>
    Math.min(MAX_MARGIN_MM, Math.max(0, Number.isFinite(v) ? v : 0)) * PT_PER_MM;
  const zoom = Number.isFinite(config.zoom)
    ? Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, config.zoom))
    : 100;
  return {
    pageWidthPt: portrait ? shortPt : longPt,
    pageHeightPt: portrait ? longPt : shortPt,
    marginsPt: {
      top: clamp(mm.top),
      right: clamp(mm.right),
      bottom: clamp(mm.bottom),
      left: clamp(mm.left),
    },
    emSize: LAYOUT_EM_PT,
    scale: zoom / 100,
    keepLinks: config.keepLinks,
    title,
    baseUrl,
  };
}

export function htmlPdfFilename(stem: string | null): string {
  if (!stem) return "document.pdf";
  return stem.replace(HTML_FILENAME_RE, "") + ".pdf";
}

/**
 * The content-box width in CSS pixels for a given layout — the viewport
 * width the layout-lowering iframe must use so the browser wraps lines and
 * flex/grid rows at the same width mupdf will lay out to (1px = 0.75pt).
 * Zoom widens the layout viewport (÷ scale), exactly like browser zoom.
 */
export function contentWidthCssPx(options: HtmlLayoutOptions): number {
  return Math.round(
    ((options.pageWidthPt - options.marginsPt.left - options.marginsPt.right) /
      options.scale) *
      (96 / 72)
  );
}

/** Derive a download filename from a page URL: last path segment, else host. */
export function urlPdfFilename(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const stem = segment.replace(/\.[a-z0-9]+$/i, "");
    return `${stem || url.hostname || "page"}.pdf`;
  } catch {
    return "page.pdf";
  }
}

export const MAX_HTML_BYTES = 25 * 1024 * 1024;
export const HTML_ACCEPT = ".html,.htm,.xhtml,text/html,application/xhtml+xml";
export const HTML_FILENAME_RE = /\.(html?|xhtml)$/i;
export const HTML_MIME_TYPES = ["text/html", "application/xhtml+xml"];

export function isHtmlFile(file: File): boolean {
  return HTML_FILENAME_RE.test(file.name) || HTML_MIME_TYPES.includes(file.type);
}
