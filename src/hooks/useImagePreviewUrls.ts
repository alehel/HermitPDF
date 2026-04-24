"use client";

import { useEffect, useMemo } from "react";
import type { ExtractedImage } from "@/lib/types";

/**
 * Build stable blob-URLs for a list of extracted images and revoke them on
 * unmount or when the list changes, so nothing leaks. The returned array is
 * index-aligned with the input.
 */
export function useImagePreviewUrls(images: ExtractedImage[]): string[] {
  const urls = useMemo(
    () =>
      images.map((img) =>
        URL.createObjectURL(new Blob([img.data as BlobPart], { type: img.mimeType }))
      ),
    [images]
  );

  useEffect(() => {
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [urls]);

  return urls;
}
