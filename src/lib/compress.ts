import type { CompressConfig } from "./types";
import { DEFAULT_IMAGE_PROCESS_CONFIG } from "./imageResize";

export const DEFAULT_COMPRESS_CONFIG: CompressConfig = {
  imageProcess: { ...DEFAULT_IMAGE_PROCESS_CONFIG, recompress: true },
  subsetFonts: true,
  deduplicateObjects: true,
  sanitizeStreams: true,
};

export function compressedFilename(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_compressed.pdf";
}
