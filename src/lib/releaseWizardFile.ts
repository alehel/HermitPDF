import { releaseDocument } from "./mupdfClient";
import { releaseDoc } from "./pdfStore";
import type { WizardFile } from "./types";

export function releaseWizardFile(file: WizardFile): void {
  // Seed with the top-level sourceDocId, not just page-derived IDs. A
  // password-protected file ingested with allowProtected has an empty page
  // stack until authenticated, so deriving solely from stack.pages would
  // release nothing and leak the OPFS bytes + worker handle (Unlock wizard,
  // where every input is protected, leaked on every remove/replace). For
  // normal files this is already among the page IDs — the Set dedupes it.
  const sourceDocIds = new Set(file.stack.pages.map((p) => p.sourceDocId));
  sourceDocIds.add(file.sourceDocId);
  for (const sourceDocId of sourceDocIds) {
    void releaseDocument(sourceDocId);
    void releaseDoc(sourceDocId);
  }
}
