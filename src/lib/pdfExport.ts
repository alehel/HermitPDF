import { PageStack, PdfMetadata } from "./types";
import { mergePdfs } from "./mupdfClient";

/** Merges all stacks (in page order) into a single PDF. */
export async function exportMergedPdf(
  stacks: PageStack[],
  metadata?: PdfMetadata
): Promise<Uint8Array> {
  const pageRefs = stacks.flatMap((s) => s.pages);
  return mergePdfs(pageRefs, metadata);
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
