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
  const [aspectRatio, setAspectRatio] = useState<number>(297 / 210); // default A4-ish

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

        const result = await renderThumbnail(
          pageRef.sourceDocId,
          pageRef.sourcePageIndex,
          width,
          pageRef.rotation
        );
        if (cancelled) return;

        setAspectRatio(result.aspectRatio);
        setThumbnail(pageRef.id, result.blobUrl);
        setDataUrl(result.blobUrl);
      } catch {
        // PDF may have been removed while rendering
      }
    }

    // If we already have a displayed thumbnail (e.g. stale after rotation),
    // keep showing it while the new one renders in the background.
    // This avoids a flash/broken-image between the old and new thumbnails.
    if (dataUrl) {
      doRender();
      return () => { cancelled = true; };
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
  }, [pageRef.id, pageRef.sourceDocId, pageRef.sourcePageIndex, pageRef.rotation, width, version, dataUrl]);

  const height = Math.round(width * aspectRatio);

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        width={width}
        height={height}
        alt="Page thumbnail"
        className={`rounded ${className}`}
        style={{ width, height }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`animate-pulse rounded bg-border ${className}`}
      style={{ width, height }}
    />
  );
}
