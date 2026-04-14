import { releaseDocument } from "./mupdfClient";
import { releaseDoc } from "./pdfStore";
import type { WizardFile } from "./types";

export function releaseWizardFile(file: WizardFile): void {
  for (const page of file.stack.pages) {
    releaseDocument(page.sourceDocId);
    releaseDoc(page.sourceDocId);
  }
}
