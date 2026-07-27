export type ScanKind = "single" | "spread";

/** Crop rectangle as fractions of the page bounds; 0,0 is the top-left. */
export interface CropRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * One scanned page in the wizard's working list. A "single" item exports as
 * one PDF page; a "spread" (both sides of an open book in one scan) exports
 * as two, split at the gutter position.
 */
export interface ScanItem {
  id: string;
  /** Owning WizardFile id — used to release the source when its last item goes. */
  fileId: string;
  sourceDocId: string;
  pageIndex: number;
  label: string;
  kind: ScanKind;
  crop: CropRect;
  /** Gutter position for spreads, as a fraction of the full page width. */
  split: number;
  /** Page width / height in points, captured at ingest. */
  widthPt: number;
  heightPt: number;
  /**
   * Effective resolution of the source scan in DPI (pixels over physical
   * size), or null when the page has no raster content to measure.
   */
  nativeDpi: number | null;
}

export const FULL_CROP: CropRect = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Smallest allowed crop extent per axis, as a fraction of the page. */
export const MIN_CROP_FRACTION = 0.05;

/** Keep the gutter split strictly inside the crop so neither half collapses. */
export function clampSplit(split: number, crop: CropRect): number {
  const margin = MIN_CROP_FRACTION / 2;
  return Math.min(
    Math.max(split, crop.x0 + margin),
    crop.x1 - margin
  );
}

export function defaultSplit(crop: CropRect): number {
  return (crop.x0 + crop.x1) / 2;
}

/**
 * A scan wider than tall is almost certainly an open-book spread; anything
 * else defaults to a single page. The slack keeps near-square scans (common
 * for book covers with generous scanner margins) from flipping to spread.
 */
export function guessKind(widthPt: number, heightPt: number): ScanKind {
  return widthPt > heightPt * 1.15 ? "spread" : "single";
}

/** The crop region(s) an item contributes to the output, in export order. */
export function cropRegions(item: ScanItem): CropRect[] {
  if (item.kind === "single") return [item.crop];
  const split = clampSplit(item.split, item.crop);
  return [
    { ...item.crop, x1: split },
    { ...item.crop, x0: split },
  ];
}

export function outputPageCount(items: ScanItem[]): number {
  return items.reduce((n, it) => n + (it.kind === "spread" ? 2 : 1), 0);
}

/**
 * Height of every exported page, in points. Scans arrive at wildly different
 * physical sizes (and images without resolution metadata default to 72 dpi,
 * inflating their point size), so a fixed height is the only predictable way
 * to make the output uniform. 11in reads comfortably at fit-to-page zoom and
 * prints without surprises.
 */
export const OUTPUT_PAGE_HEIGHT_PT = 792;

/**
 * Render DPI (relative to the source page's point size) that makes the crop
 * come out at `outputDpi` relative to the *output* page — so the chosen
 * resolution means the same pixel density on every exported page no matter
 * how large the source scan was. Capped to keep pathological tiny crops
 * from exploding render memory.
 */
export function renderDpiForRegion(outputDpi: number, cropHeightPt: number): number {
  const dpi = (outputDpi * OUTPUT_PAGE_HEIGHT_PT) / cropHeightPt;
  return Math.min(Math.max(dpi, 24), 1200);
}

/** Fallback output DPI when no scan carries measurable raster content. */
export const FALLBACK_OUTPUT_DPI = 300;

/**
 * The highest output DPI that doesn't upscale any scan: for each item, the
 * cropped region has nativeDpi × cropHeight native pixel rows, which the
 * output page spreads over OUTPUT_PAGE_HEIGHT_PT — the minimum of those
 * densities is the point past which the *worst* scan would be invented
 * detail. Rendering everything at this DPI keeps the lowest-resolution
 * page untouched and downsamples the rest to match. Null when no item has
 * measurable resolution.
 */
export function matchOutputDpi(items: ScanItem[]): number | null {
  let min: number | null = null;
  for (const item of items) {
    if (item.nativeDpi === null) continue;
    const cropHeightPt = item.heightPt * (item.crop.y1 - item.crop.y0);
    const dpi = (item.nativeDpi * cropHeightPt) / OUTPUT_PAGE_HEIGHT_PT;
    if (min === null || dpi < min) min = dpi;
  }
  return min;
}

/** Lower-resolution choices offered to the user, filtered against the cap. */
export const DPI_CHOICES = [600, 450, 300, 200, 150, 100, 75];

export function bookScanFilename(firstFileName: string): string {
  const base = firstFileName.replace(/\.(pdf|jpe?g|png|heic|heif|webp)$/i, "");
  return base + "_book.pdf";
}
