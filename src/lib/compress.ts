import type { CompressConfig } from "./types";

export const DEFAULT_COMPRESS_CONFIG: CompressConfig = {
  recompressImages: true,
  imageQuality: 75,
  subsetFonts: true,
  deduplicateObjects: true,
  sanitizeStreams: true,
};

export function compressedFilename(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_compressed.pdf";
}
