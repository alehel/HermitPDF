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
  /**
   * Optional height/width ratio for the slot. When provided, every thumbnail
   * uses a slot of this exact shape — the img inside scales to fit while
   * preserving its own aspect ratio. Use when rendering a grid of mixed-
   * orientation pages and the caller wants uniform card sizes (e.g. the
   * rotate wizard, which picks a portrait-shaped box that fits every page
   * when oriented to portrait). When omitted, the slot uses the page's
   * natural aspect ratio — fine for single-thumbnail callers.
   */
  boxAspectRatio?: number;
}

export function PdfThumbnail({
  pageRef,
  width = 120,
  className = "",
  version,
  boxAspectRatio,
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

  // Slot dimensions. With `boxAspectRatio`, every slot in the grid has the
  // same shape — the caller picks a ratio that fits each page in its portrait
  // orientation. Without it, the slot mirrors this page's natural orientation.
  // Either way the slot doesn't change on rotation, so surrounding layout
  // (e.g. rotate buttons) stays stable.
  const isRotated = pageRef.rotation % 180 !== 0;
  const containerWidth = width;
  const containerHeight = width * (boxAspectRatio ?? naturalAspectRatio);
  // Scale the img to fit inside the slot, preserving its natural aspect ratio
  // and accounting for rotation. The img element's width/height are the
  // pre-rotation dimensions; CSS rotate(N°) swaps the visual bbox.
  const imgWidth = isRotated
    ? Math.min(containerWidth / naturalAspectRatio, containerHeight)
    : Math.min(containerWidth, containerHeight / naturalAspectRatio);
  const imgHeight = imgWidth * naturalAspectRatio;

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
