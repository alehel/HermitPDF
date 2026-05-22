/**
 * Raw PDF document byte storage, backed by OPFS.
 *
 * Each entry holds the original, unmodified PDF as uploaded, written to a
 * file at `/docs/<id>.pdf` in the Origin Private File System. Keeping bytes
 * on disk frees the JS heap when a doc isn't actively held in MuPDF's WASM
 * heap, and avoids holding a second copy alongside the WASM-resident one.
 *
 * React state should only hold lightweight metadata (PageRef objects).
 */

import { getDocsDir } from "./opfs";

function fileName(id: string): string {
  return `${id}.pdf`;
}

// Tracks in-flight `storeDoc` writes so `releaseDoc` can wait for the
// writable stream to close before calling `removeEntry`. Without this, a
// user who clicks remove during a multi-second write to a large file hits
// NoModificationAllowedError (the file is exclusively locked while the
// writable stream is open).
const writing = new Map<string, Promise<void>>();

// Coalesces concurrent `releaseDoc` calls for the same id. Two simultaneous
// `dir.removeEntry` calls on the same file race in Chrome — one wins, the
// other throws NoModificationAllowedError. React Strict Mode (enabled by
// Next dev) double-invokes setState updaters, so a setFile updater that
// calls releaseDoc fires it twice. Even outside Strict Mode, callers that
// release the same id from two paths could collide. Idempotency here makes
// the call safe regardless.
const removing = new Map<string, Promise<void>>();

export function storeDoc(id: string, source: Blob): Promise<void> {
  let self: Promise<void>;
  const run = async () => {
    try {
      const dir = await getDocsDir();
      const handle = await dir.getFileHandle(fileName(id), { create: true });
      const writable = await handle.createWritable();
      await source.stream().pipeTo(writable);
    } finally {
      if (writing.get(id) === self) writing.delete(id);
    }
  };
  self = run();
  writing.set(id, self);
  return self;
}

export async function retrieveDoc(
  id: string
): Promise<ArrayBuffer | undefined> {
  const dir = await getDocsDir();
  try {
    const handle = await dir.getFileHandle(fileName(id), { create: false });
    const file = await handle.getFile();
    return await file.arrayBuffer();
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return undefined;
    throw e;
  }
}

export function releaseDoc(id: string): Promise<void> {
  const existing = removing.get(id);
  if (existing) return existing;
  const p = doRelease(id);
  removing.set(id, p);
  p.finally(() => {
    if (removing.get(id) === p) removing.delete(id);
  });
  return p;
}

async function doRelease(id: string): Promise<void> {
  const pending = writing.get(id);
  if (pending) {
    await pending.catch(() => {
      // best-effort: even if the write failed, attempt the remove
    });
  }
  const dir = await getDocsDir();
  try {
    await dir.removeEntry(fileName(id));
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return;
    throw e;
  }
}
