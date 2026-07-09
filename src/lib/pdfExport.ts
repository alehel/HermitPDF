import { PageStack, PdfMetadata } from "./types";
import { mergePdfs } from "./mupdfClient";
import { downloadBlob } from "./download";
import { interleavePages } from "./collate";
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

/** Collates two stacks by interleaving their pages into a single PDF.
 *
 * Produces `a[0]`, `b[0]`, `a[1]`, `b[1]`, … with any leftover pages of the
 * longer document appended at the end. When `reverseSecond` is set the second
 * stack is reversed first, matching duplex scans whose back sides come out in
 * reverse order.
 */
export async function exportCollatedPdf(
  first: PageStack,
  second: PageStack,
  reverseSecond?: boolean,
  metadata?: PdfMetadata
): Promise<Uint8Array> {
  const pageRefs = interleavePages(first.pages, second.pages, { reverseSecond });
  return mergePdfs(pageRefs, metadata);
}

export function downloadPdf(data: Uint8Array, filename: string): void {
  downloadBlob(new Blob([data as BlobPart], { type: "application/pdf" }), filename);
}
