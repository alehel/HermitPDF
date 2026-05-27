export interface ContrastConfig {
  contrast: number;
  brightness: number;
  thresholdEnabled: boolean;
  threshold: number;
}

export const DEFAULT_CONTRAST_CONFIG: ContrastConfig = {
  contrast: 1,
  brightness: 1,
  thresholdEnabled: false,
  threshold: 128,
};

export function contrastFilename(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_contrast.pdf";
}

export function configsEqual(a: ContrastConfig, b: ContrastConfig): boolean {
  return (
    a.contrast === b.contrast &&
    a.brightness === b.brightness &&
    a.thresholdEnabled === b.thresholdEnabled &&
    (!a.thresholdEnabled || a.threshold === b.threshold)
  );
}

export function isDefaultConfig(c: ContrastConfig): boolean {
  return configsEqual(c, DEFAULT_CONTRAST_CONFIG);
}

export type ExportDpiPreset = "low" | "medium" | "high";

export const DPI_FOR_PRESET: Record<ExportDpiPreset, number> = {
  low: 150,
  medium: 200,
  high: 300,
};

/**
 * Mutate an RGBA pixel buffer in place: brightness * contrast * optional
 * threshold. Matches the CSS `filter: brightness() contrast()` math so the
 * live preview (CSS-filtered) and the exported pages stay visually aligned.
 *
 * Brightness is a simple multiply on each channel.
 * Contrast follows the SVG/CSS spec: out = (in - 0.5) * amount + 0.5.
 * Threshold binarizes the luminance — every channel becomes 0 or 255.
 */
export function applyContrastToImageData(
  data: Uint8ClampedArray,
  config: ContrastConfig
): void {
  const { contrast, brightness, thresholdEnabled, threshold } = config;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (brightness !== 1) {
      r *= brightness;
      g *= brightness;
      b *= brightness;
    }
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }
    if (thresholdEnabled) {
      // Rec. 709 luma — matches what the eye reads as "darkness".
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const v = luma >= threshold ? 255 : 0;
      r = v;
      g = v;
      b = v;
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
}
