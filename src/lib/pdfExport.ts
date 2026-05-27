import { PageStack, PdfMetadata } from "./types";
import { mergePdfs } from "./mupdfClient";
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
  const blob = new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
