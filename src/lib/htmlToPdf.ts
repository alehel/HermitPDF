import { pageSizeInPoints, type PageSizeKey } from "./imageResize";

// Shared types/constants for the HTML → PDF wizard. Imported by the wizard,
// the mupdf client, and the worker — keep it free of DOM-only APIs.

export type HtmlPageSizeKey = Exclude<PageSizeKey, "Original">;
export const HTML_PAGE_SIZE_KEYS: HtmlPageSizeKey[] = ["A4", "Letter", "Legal", "A5", "A3"];

export type HtmlOrientation = "portrait" | "landscape";
export const HTML_ORIENTATIONS: HtmlOrientation[] = ["portrait", "landscape"];

export type HtmlMarginPreset = "none" | "small" | "normal" | "large";
export const HTML_MARGIN_PRESETS: HtmlMarginPreset[] = ["none", "small", "normal", "large"];
const MARGIN_MM: Record<HtmlMarginPreset, number> = { none: 0, small: 10, normal: 20, large: 30 };
const PT_PER_MM = 72 / 25.4;

export const MIN_EM_SIZE = 8;
export const MAX_EM_SIZE = 20;

/** Wizard-facing settings state. */
export interface HtmlToPdfConfig {
  pageSize: HtmlPageSizeKey;
  orientation: HtmlOrientation;
  margin: HtmlMarginPreset;
  /** Base font size in points — mupdf's layout `em` parameter. */
  emSize: number;
  keepLinks: boolean;
}

export const DEFAULT_HTML_TO_PDF_CONFIG: HtmlToPdfConfig = {
  pageSize: "A4",
  orientation: "portrait",
  margin: "normal",
  emSize: 12,
  keepLinks: true,
};

/** Resolved geometry crossing the worker boundary. All lengths in points. */
export interface HtmlLayoutOptions {
  pageWidthPt: number;
  pageHeightPt: number;
  /** Uniform margin on all four sides. */
  marginPt: number;
  emSize: number;
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
  return {
    pageWidthPt: portrait ? shortPt : longPt,
    pageHeightPt: portrait ? longPt : shortPt,
    // Largest preset (30mm) on the smallest page (A5, 148mm short edge)
    // still leaves a positive content box, so no clamping is needed.
    marginPt: MARGIN_MM[config.margin] * PT_PER_MM,
    emSize: config.emSize,
    keepLinks: config.keepLinks,
    title,
    baseUrl,
  };
}

export function htmlPdfFilename(stem: string | null): string {
  if (!stem) return "document.pdf";
  return stem.replace(HTML_FILENAME_RE, "") + ".pdf";
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
