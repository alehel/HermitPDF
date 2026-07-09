import type { WizardFile } from "./types";
import { exportMergedPdf, downloadPdf } from "./pdfExport";
import { buildZip, downloadZip } from "./zipBuilder";

/**
 * Build one output PDF per document: the prepend files' pages, then the
 * document's own pages, then the append files' pages. The same prepend and
 * append files are applied to every document.
 */
export async function exportAttachedPdfs(
  documents: WizardFile[],
  prepends: WizardFile[],
  appends: WizardFile[]
): Promise<{ name: string; data: Uint8Array }[]> {
  const results: { name: string; data: Uint8Array }[] = [];

  for (const doc of documents) {
    const stacks = [
      ...prepends.map((f) => f.stack),
      doc.stack,
      ...appends.map((f) => f.stack),
    ];
    const data = await exportMergedPdf(stacks);
    const name = doc.name.replace(/\.pdf$/i, "") + "_combined.pdf";
    results.push({ name, data });
  }

  return results;
}

/** Download the combined results — single PDF or ZIP for multiple documents. */
export function downloadAttachOutput(
  results: { name: string; data: Uint8Array }[]
): void {
  if (results.length === 1) {
    downloadPdf(results[0].data, results[0].name);
  } else {
    const zipData = buildZip(results);
    downloadZip(zipData, "combined.zip");
  }
}
