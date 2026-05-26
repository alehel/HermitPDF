"use client";

import { useEffect, useRef, useState } from "react";
import { renderThumbnail, loadDocument } from "@/lib/mupdfClient";
import { getThumbnail, setThumbnail } from "@/lib/thumbnailCache";
import { PageRef } from "@/lib/types";

interface PdfThumbnailProps {
  pageRef: PageRef;
  width?: number;
  className?: string;
  version?: number;
}

export function PdfThumbnail({
  pageRef,
  width = 120,
  className = "",
  version,
}: PdfThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | undefined>(() =>
    getThumbnail(pageRef.id)
  );
  // Aspect ratio of the page at its natural (unrotated) orientation: height / width.
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number>(297 / 210); // default A4-ish

  useEffect(() => {
    // Check cache — may have been updated externally
    const cached = getThumbnail(pageRef.id);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    let cancelled = false;

    async function doRender() {
      try {
        await loadDocument(pageRef.sourceDocId);
        if (cancelled) return;

        // Always rasterize at rotation 0 — display rotation is applied via CSS
        // transform below, so rotating pages doesn't require a worker round-trip
        // and the cached bitmap stays valid across rotation changes.
        const result = await renderThumbnail(
          pageRef.sourceDocId,
          pageRef.sourcePageIndex,
          width,
          0
        );
        if (cancelled) return;

        setNaturalAspectRatio(result.aspectRatio);
        setThumbnail(pageRef.id, result.blobUrl);
        setDataUrl(result.blobUrl);
      } catch {
        // PDF may have been removed while rendering
      }
    }

    // Already have a thumbnail — nothing to do. Rotation changes are handled
    // via CSS transform on the existing bitmap, so no re-render is needed.
    if (dataUrl) {
      return;
    }

    // First load — show placeholder and lazy-load via IntersectionObserver
    const el = containerRef.current;
    if (!el) {
      doRender();
      return () => { cancelled = true; };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          doRender();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pageRef.id, pageRef.sourceDocId, pageRef.sourcePageIndex, width, version, dataUrl]);

  // The slot is sized at the page's natural orientation, so at rotation 0
  // the thumbnail fills the slot. Rotation doesn't resize the slot (keeping
  // surrounding layout stable — e.g. rotate buttons don't jump on click) —
  // the rotated img is scaled down to fit inside the same slot.
  const isRotated = pageRef.rotation % 180 !== 0;
  const containerWidth = width;
  const containerHeight = width * naturalAspectRatio;
  // After rotation, the visual bounding box is (imgHeight × imgWidth). Fit
  // it inside (containerWidth × containerHeight) while preserving the bitmap's
  // natural aspect ratio. For rotation 0, the img fills the slot.
  const imgHeight = isRotated
    ? Math.min(containerWidth, containerHeight * naturalAspectRatio)
    : containerHeight;
  const imgWidth = isRotated ? imgHeight / naturalAspectRatio : containerWidth;

  if (dataUrl) {
    return (
      <div
        className={className}
        style={{
          width: containerWidth,
          height: containerHeight,
          position: "relative",
        }}
      >
        <img
          src={dataUrl}
          alt="Page thumbnail"
          className="rounded"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: imgWidth,
            height: imgHeight,
            transform: `translate(-50%, -50%) rotate(${pageRef.rotation}deg)`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`animate-pulse rounded bg-border ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
    />
  );
}
