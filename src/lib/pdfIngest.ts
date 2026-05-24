import { PageStack, PageRef } from "./types";
import { storeDoc, releaseDoc } from "./pdfStore";
import {
  getPageCount,
  loadDocument,
  needsPassword,
  releaseDocument,
  setDocMagic,
} from "./mupdfClient";

export interface IngestResult {
  stack: PageStack;
  sourceDocId: string;
  needsPassword: boolean;
}

/**
 * Hard ceiling for upload size. The practical bottleneck is MuPDF's WASM heap
 * (32-bit, ~4 GB max, less in practice once parsed object overhead is counted).
 * 1 GB leaves comfortable headroom; users with bigger PDFs hit a clear error
 * instead of an OOM tab crash partway through ingestion.
 */
export const MAX_INGEST_BYTES = 1_000_000_000;

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
  source: Blob,
  name: string,
  fileSize: number,
  options?: { allowProtected?: boolean; magic?: string }
): Promise<IngestResult> {
  const sourceDocId = crypto.randomUUID();
  if (options?.magic) {
    setDocMagic(sourceDocId, options.magic);
  }
  await storeDoc(sourceDocId, source);

  try {
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
  } catch (err) {
    // Anything past the storeDoc write must roll back the OPFS file and any
    // worker-side handle so a failed ingest doesn't leak storage or memory.
    void releaseDocument(sourceDocId);
    void releaseDoc(sourceDocId);
    throw err;
  }
}
