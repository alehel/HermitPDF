"use client";

import { useCallback } from "react";

interface BlobImageProps {
  data: Uint8Array;
  mimeType: string;
  alt: string;
  className?: string;
}

/**
 * <img> that displays raw image bytes via a blob URL. The URL is created when
 * the element attaches and revoked by the ref cleanup when it detaches, so
 * its lifetime exactly matches the DOM node — discarded renders and Strict
 * Mode remounts can neither leak URLs nor leave an <img> pointing at a
 * revoked one (both of which the previous create-in-useMemo approach did).
 */
export function BlobImage({ data, mimeType, alt, className }: BlobImageProps) {
  const attachSrc = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) return;
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }));
      el.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [data, mimeType]
  );

  // Blob URLs of user content can't go through the Next image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={attachSrc} alt={alt} className={className} />;
}
