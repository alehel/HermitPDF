import type { BatesConfig, BatesPosition } from "./types";

export const DEFAULT_BATES_CONFIG: BatesConfig = {
  prefix: "",
  startNumber: 1,
  digits: 6,
  position: "bottom-right",
  fontSize: 10,
  padding: 4,
  shrink: true,
};

/** Format a Bates number string, e.g. "SMITH-000001" or "000001". */
export function formatBatesNumber(
  prefix: string,
  num: number,
  digits: number
): string {
  const padded = String(num).padStart(digits, "0");
  return prefix ? `${prefix}-${padded}` : padded;
}

/**
 * Compute the shrink margin needed on the stamp side of the page.
 * This is the space reserved for the Bates number when shrink mode is on.
 */
export function computeShrinkMargin(fontSize: number, padding: number): number {
  return fontSize + padding * 2;
}

/**
 * Compute the scale factor and translation for shrinking page content.
 * Returns the 6 components of a PDF cm transformation matrix.
 *
 * The content is scaled uniformly to fit within the reduced area,
 * then centered horizontally and pushed away from the stamp edge.
 */
export function computeShrinkTransform(
  pageWidth: number,
  pageHeight: number,
  position: BatesPosition,
  fontSize: number,
  padding: number
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const stampMargin = computeShrinkMargin(fontSize, padding);
  const isTop = position.startsWith("top");

  // Scale uniformly so content fits within the padded area
  const scaleX = (pageWidth - 2 * padding) / pageWidth;
  const scaleY = (pageHeight - stampMargin) / pageHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center horizontally within the padded area
  const dx = padding + ((pageWidth - 2 * padding) - scale * pageWidth) / 2;

  // Push content away from the stamp edge, center in remaining vertical space
  const availableHeight = pageHeight - stampMargin;
  const verticalSlack = availableHeight - scale * pageHeight;
  const dy = isTop ? verticalSlack / 2 : stampMargin + verticalSlack / 2;

  return { a: scale, b: 0, c: 0, d: scale, e: dx, f: dy };
}

/**
 * Compute the position for the Bates stamp text in PDF user-space coordinates.
 * Returns the (x, y) origin for the text baseline.
 *
 * When shrink is on, the stamp is placed in the cleared margin.
 * When shrink is off, the stamp overlays near the page edge.
 */
export function computeStampPosition(
  pageWidth: number,
  pageHeight: number,
  position: BatesPosition,
  fontSize: number,
  padding: number
): { x: number; y: number } {
  const isTop = position.startsWith("top");

  // Vertical position — MuPDF annotations use device coordinates (y=0 at top)
  let y: number;
  if (isTop) {
    y = padding;
  } else {
    y = pageHeight - fontSize - padding;
  }

  // Horizontal
  let x: number;
  if (position.endsWith("left")) {
    x = padding;
  } else if (position.endsWith("right")) {
    // We'll use right-aligned text (quadding), so x is the right edge inset
    x = pageWidth - padding;
  } else {
    // center
    x = pageWidth / 2;
  }

  return { x, y };
}

/**
 * Determine the PDF text quadding value (alignment) for a position.
 * 0 = left, 1 = center, 2 = right.
 */
export function getQuadding(position: BatesPosition): number {
  if (position.endsWith("left")) return 0;
  if (position.endsWith("right")) return 2;
  return 1;
}
