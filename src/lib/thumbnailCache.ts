const cache = new Map<string, string>();

export function getThumbnail(pageId: string): string | undefined {
  return cache.get(pageId);
}

export function setThumbnail(pageId: string, blobUrl: string): void {
  const existing = cache.get(pageId);
  if (existing) URL.revokeObjectURL(existing);
  cache.set(pageId, blobUrl);
}

/**
 * Remove a thumbnail from cache without revoking the blob URL.
 * The URL may still be referenced by an <img> element — revocation
 * happens in setThumbnail when a replacement arrives, or on page unload.
 */
export function clearThumbnail(pageId: string): void {
  cache.delete(pageId);
}
