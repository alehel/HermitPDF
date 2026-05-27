/**
 * Page-size + DPI based image resize.
 *
 * Used by the compress and merge wizards to cap the pixel dimensions of an
 * image (either embedded in a PDF or supplied as a raw image) to a chosen
 * paper size at a chosen DPI. The cap is a simple ceiling on the longer / shorter
 * pixel dimensions — orientation is matched to the image aspect so a landscape
 * photo gets the landscape variant of the page.
 */

export type PageSizeKey = "A5" | "A4" | "Letter" | "A3" | "Legal";
export type DpiPreset = 72 | 96 | 150 | 300;

export const PAGE_SIZE_KEYS: PageSizeKey[] = ["A5", "A4", "Letter", "A3", "Legal"];
export const DPI_PRESETS: DpiPreset[] = [72, 96, 150, 300];

/** Page sizes in millimetres (portrait orientation: short × long). */
const PAGE_SIZES_MM: Record<PageSizeKey, { shortMm: number; longMm: number }> = {
  A5: { shortMm: 148, longMm: 210 },
  A4: { shortMm: 210, longMm: 297 },
  Letter: { shortMm: 8.5 * 25.4, longMm: 11 * 25.4 },
  A3: { shortMm: 297, longMm: 420 },
  Legal: { shortMm: 8.5 * 25.4, longMm: 14 * 25.4 },
};

const MM_PER_INCH = 25.4;

export interface ResizeConfig {
  enabled: boolean;
  pageSize: PageSizeKey;
  dpi: DpiPreset;
}

export const DEFAULT_RESIZE_CONFIG: ResizeConfig = {
  enabled: false,
  pageSize: "A4",
  dpi: 150,
};

export function pageSizeInPoints(pageSize: PageSizeKey): { shortPt: number; longPt: number } {
  const { shortMm, longMm } = PAGE_SIZES_MM[pageSize];
  return {
    shortPt: (shortMm / MM_PER_INCH) * 72,
    longPt: (longMm / MM_PER_INCH) * 72,
  };
}

/**
 * Max pixel dimensions a single image may have at the given page size + DPI.
 * Returned as { shortPx, longPx } so the caller can match against image aspect.
 */
export function maxPixelsForResize(config: ResizeConfig): { shortPx: number; longPx: number } {
  const { shortMm, longMm } = PAGE_SIZES_MM[config.pageSize];
  return {
    shortPx: Math.round((shortMm / MM_PER_INCH) * config.dpi),
    longPx: Math.round((longMm / MM_PER_INCH) * config.dpi),
  };
}

/**
 * Compute the resized pixel dimensions for an image of (srcW × srcH), capped
 * by the page-size + DPI cap and oriented to match the image's own aspect.
 * Returns the same dimensions if the image already fits.
 */
export function fitWithinResizeCap(
  srcW: number,
  srcH: number,
  config: ResizeConfig
): { width: number; height: number; scaled: boolean } {
  const { shortPx, longPx } = maxPixelsForResize(config);
  const imageIsLandscape = srcW >= srcH;
  const maxW = imageIsLandscape ? longPx : shortPx;
  const maxH = imageIsLandscape ? shortPx : longPx;

  if (srcW <= maxW && srcH <= maxH) {
    return { width: srcW, height: srcH, scaled: false };
  }

  const scale = Math.min(maxW / srcW, maxH / srcH);
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    scaled: true,
  };
}

export interface ImageProcessConfig {
  recompress: boolean;
  quality: number;
  resize: ResizeConfig;
}

export const DEFAULT_IMAGE_PROCESS_CONFIG: ImageProcessConfig = {
  recompress: true,
  quality: 75,
  resize: { ...DEFAULT_RESIZE_CONFIG },
};

export function imageProcessConfigsEqual(a: ImageProcessConfig, b: ImageProcessConfig): boolean {
  return (
    a.recompress === b.recompress &&
    a.quality === b.quality &&
    a.resize.enabled === b.resize.enabled &&
    a.resize.pageSize === b.resize.pageSize &&
    a.resize.dpi === b.resize.dpi
  );
}
