const cache = new Map<string, string>();

export function getThumbnail(pageId: string): string | undefined {
  return cache.get(pageId);
}

export function setThumbnail(pageId: string, blobUrl: string): void {
  const existing = cache.get(pageId);
  if (existing) URL.revokeObjectURL(existing);
  cache.set(pageId, blobUrl);
}

export function clearThumbnail(pageId: string): void {
  const existing = cache.get(pageId);
  if (existing) URL.revokeObjectURL(existing);
  cache.delete(pageId);
}
