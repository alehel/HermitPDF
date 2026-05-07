import { releaseDocument } from "./mupdfClient";
import { releaseDoc } from "./pdfStore";
import type { WizardFile } from "./types";

export function releaseWizardFile(file: WizardFile): void {
  const sourceDocIds = new Set(file.stack.pages.map((p) => p.sourceDocId));
  for (const sourceDocId of sourceDocIds) {
    releaseDocument(sourceDocId);
    void releaseDoc(sourceDocId);
  }
}
