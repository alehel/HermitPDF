/**
 * Page-size + DPI based image resize.
 *
 * Used by the compress and merge wizards to cap the pixel dimensions of an
 * image (either embedded in a PDF or supplied as a raw image) to a chosen
 * paper size at a chosen DPI. The cap is a simple ceiling on the longer / shorter
 * pixel dimensions — orientation is matched to the image aspect so a landscape
 * photo gets the landscape variant of the page.
 *
 * "Original" is a sentinel page size meaning "don't cap" — it's the default
 * for new resize configs, paired with the master "recompress" toggle so the
 * user can re-encode images without changing their dimensions.
 */

export type PageSizeKey = "Original" | "A5" | "A4" | "Letter" | "A3" | "Legal";
export type DpiPreset = 72 | 96 | 150 | 300;

export const PAGE_SIZE_KEYS: PageSizeKey[] = [
  "Original",
  "A5",
  "A4",
  "Letter",
  "A3",
  "Legal",
];
export const DPI_PRESETS: DpiPreset[] = [72, 96, 150, 300];

/** Page sizes in millimetres (portrait orientation: short × long). */
const PAGE_SIZES_MM: Record<Exclude<PageSizeKey, "Original">, { shortMm: number; longMm: number }> = {
  A5: { shortMm: 148, longMm: 210 },
  A4: { shortMm: 210, longMm: 297 },
  Letter: { shortMm: 8.5 * 25.4, longMm: 11 * 25.4 },
  A3: { shortMm: 297, longMm: 420 },
  Legal: { shortMm: 8.5 * 25.4, longMm: 14 * 25.4 },
};

const MM_PER_INCH = 25.4;

export interface ResizeConfig {
  pageSize: PageSizeKey;
  dpi: DpiPreset;
}

export const DEFAULT_RESIZE_CONFIG: ResizeConfig = {
  pageSize: "Original",
  dpi: 150,
};

/** True iff this config actually caps pixel dimensions (pageSize is a real paper). */
export function isResizeActive(config: ResizeConfig): boolean {
  return config.pageSize !== "Original";
}

export function pageSizeInPoints(pageSize: Exclude<PageSizeKey, "Original">): {
  shortPt: number;
  longPt: number;
} {
  const { shortMm, longMm } = PAGE_SIZES_MM[pageSize];
  return {
    shortPt: (shortMm / MM_PER_INCH) * 72,
    longPt: (longMm / MM_PER_INCH) * 72,
  };
}

/**
 * Compute the resized pixel dimensions for an image of (srcW × srcH), capped
 * by the page-size + DPI cap and oriented to match the image's own aspect.
 * Returns the same dimensions if the image already fits, or always if the
 * pageSize is "Original".
 */
export function fitWithinResizeCap(
  srcW: number,
  srcH: number,
  config: ResizeConfig
): { width: number; height: number; scaled: boolean } {
  if (config.pageSize === "Original") {
    return { width: srcW, height: srcH, scaled: false };
  }

  const { shortMm, longMm } = PAGE_SIZES_MM[config.pageSize];
  const shortPx = Math.round((shortMm / MM_PER_INCH) * config.dpi);
  const longPx = Math.round((longMm / MM_PER_INCH) * config.dpi);

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
    a.resize.pageSize === b.resize.pageSize &&
    a.resize.dpi === b.resize.dpi
  );
}
