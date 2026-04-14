/**
 * Raw PDF document byte storage.
 *
 * Keeps ArrayBuffers in an in-memory Map keyed by document ID.
 * Each entry holds the original, unmodified PDF as uploaded.
 * React state should only hold lightweight metadata (PageRef objects).
 *
 * Designed to be swappable to OPFS (Origin Private File System) in
 * the future without changing consumer code.
 */

const store = new Map<string, ArrayBuffer>();

export function storeDoc(id: string, data: ArrayBuffer): void {
  store.set(id, data);
}

export function retrieveDoc(id: string): ArrayBuffer | undefined {
  return store.get(id);
}

export function releaseDoc(id: string): void {
  store.delete(id);
}
