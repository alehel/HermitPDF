import { PageStack, PdfMetadata } from "./types";
import { mergePdfs } from "./mupdfClient";
import { downloadBlob } from "./download";
import type { ImageProcessConfig } from "./imageResize";

/** Merges all stacks (in page order) into a single PDF.
 *
 * `imageProcessByDocId` optionally passes per-source image processing config
 * (resize + recompress) applied to image-derived sources at merge time.
 */
export async function exportMergedPdf(
  stacks: PageStack[],
  metadata?: PdfMetadata,
  imageProcessByDocId?: Map<string, ImageProcessConfig>
): Promise<Uint8Array> {
  const pageRefs = stacks.flatMap((s) => s.pages);
  return mergePdfs(pageRefs, metadata, imageProcessByDocId);
}

export function downloadPdf(data: Uint8Array, filename: string): void {
  downloadBlob(new Blob([data as BlobPart], { type: "application/pdf" }), filename);
}
