import { PageStack, PageRef } from "./types";
import { storeDoc } from "./pdfStore";
import { getPageCount, loadDocument } from "./mupdfClient";

/**
 * Ingest a raw PDF: store the original bytes once and build a PageStack
 * of PageRef objects that reference individual pages by index.
 *
 * No splitting occurs — the original document is kept intact so that
 * shared resources (fonts, images) are preserved for export.
 */
export async function ingestDocument(
  data: ArrayBuffer,
  name: string,
  fileSize: number
): Promise<PageStack> {
  const sourceDocId = crypto.randomUUID();
  storeDoc(sourceDocId, data);

  // Open the document in the worker to discover the page count
  await loadDocument(sourceDocId);
  const count = await getPageCount(sourceDocId);

  const pages: PageRef[] = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    sourceDocId,
    sourcePageIndex: i,
    rotation: 0,
  }));

  return {
    id: crypto.randomUUID(),
    pages,
    name,
    size: fileSize,
  };
}
