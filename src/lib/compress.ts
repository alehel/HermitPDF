import type { CompressConfig } from "./types";
import { DEFAULT_RESIZE_CONFIG } from "./imageResize";

export const DEFAULT_COMPRESS_CONFIG: CompressConfig = {
  recompressImages: true,
  imageQuality: 75,
  subsetFonts: true,
  deduplicateObjects: true,
  sanitizeStreams: true,
  resize: { ...DEFAULT_RESIZE_CONFIG },
};

export function compressedFilename(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_compressed.pdf";
}
