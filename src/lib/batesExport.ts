import type { BatesConfig, WizardFile } from "./types";
import { applyBatesStamp } from "./mupdfClient";
import { downloadPdf } from "./pdfExport";
import { buildZip, downloadZip } from "./zipBuilder";

/**
 * Apply Bates numbering across multiple files with continuous page numbering.
 * Files are processed in order — the numbering sequence carries across files.
 */
export async function exportBatesPdfs(
  files: WizardFile[],
  config: BatesConfig
): Promise<{ name: string; data: Uint8Array }[]> {
  const results: { name: string; data: Uint8Array }[] = [];
  let runningPageNumber = config.startNumber;

  for (const file of files) {
    const data = await applyBatesStamp(file.stack.pages[0].sourceDocId, {
      ...config,
      startNumber: runningPageNumber,
    });

    const name = file.name.replace(/\.pdf$/i, "") + "_bates.pdf";
    results.push({ name, data });
    runningPageNumber += file.pageCount;
  }

  return results;
}

/** Download Bates-stamped results — single PDF or ZIP for multiple files. */
export function downloadBatesOutput(
  results: { name: string; data: Uint8Array }[]
): void {
  if (results.length === 1) {
    downloadPdf(results[0].data, results[0].name);
  } else {
    const zipData = buildZip(results);
    downloadZip(zipData, "bates_numbered.zip");
  }
}
