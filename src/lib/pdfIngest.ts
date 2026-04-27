import { PageStack, PageRef } from "./types";
import { storeDoc } from "./pdfStore";
import { getPageCount, loadDocument, needsPassword } from "./mupdfClient";

export interface IngestResult {
  stack: PageStack;
  sourceDocId: string;
  needsPassword: boolean;
}

/**
 * Ingest a raw PDF: store the original bytes once and build a PageStack
 * of PageRef objects that reference individual pages by index.
 *
 * No splitting occurs — the original document is kept intact so that
 * shared resources (fonts, images) are preserved for export.
 *
 * With `allowProtected`, password-protected PDFs are returned with an empty
 * page stack and `needsPassword: true` instead of throwing — the caller is
 * expected to authenticate via the worker and re-fetch the page count.
 */
export async function ingestDocument(
  data: ArrayBuffer,
  name: string,
  fileSize: number,
  options?: { allowProtected?: boolean }
): Promise<IngestResult> {
  const sourceDocId = crypto.randomUUID();
  storeDoc(sourceDocId, data);

  await loadDocument(sourceDocId);

  if (options?.allowProtected && (await needsPassword(sourceDocId))) {
    return {
      stack: {
        id: crypto.randomUUID(),
        pages: [],
        name,
        size: fileSize,
      },
      sourceDocId,
      needsPassword: true,
    };
  }

  const count = await getPageCount(sourceDocId);

  const pages: PageRef[] = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    sourceDocId,
    sourcePageIndex: i,
    rotation: 0,
  }));

  return {
    stack: {
      id: crypto.randomUUID(),
      pages,
      name,
      size: fileSize,
    },
    sourceDocId,
    needsPassword: false,
  };
}
