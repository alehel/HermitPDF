"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderPage, loadDocument, getImagePositions } from "@/lib/mupdfClient";
import { PageRef, ImagePosition } from "@/lib/types";

interface PdfPageProps {
  pageRef: PageRef;
  scale?: number;
  onImageContextMenu?: (
    event: React.MouseEvent,
    pageRef: PageRef,
    imageIndex: number
  ) => void;
}

export function PdfPage({ pageRef, scale = 1.5, onImageContextMenu }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imagePositions, setImagePositions] = useState<ImagePosition[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        await loadDocument(pageRef.sourceDocId);
        if (cancelled) return;

        const imageData = await renderPage(
          pageRef.sourceDocId,
          pageRef.sourcePageIndex,
          scale,
          pageRef.rotation
        );
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = imageData.width;
        canvas.height = imageData.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.putImageData(imageData, 0, 0);

        // Fetch image positions for hit-testing after render
        const positions = await getImagePositions(
          pageRef.sourceDocId,
          pageRef.sourcePageIndex,
          scale,
          pageRef.rotation
        );
        if (!cancelled) setImagePositions(positions);
      } catch {
        // PDF may have been removed while rendering
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [pageRef.sourceDocId, pageRef.sourcePageIndex, pageRef.rotation, scale]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onImageContextMenu || imagePositions.length === 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Convert mouse position to canvas pixel coordinates
      const rect = canvas.getBoundingClientRect();
      const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;

      // Check if click falls within any image bbox
      for (const pos of imagePositions) {
        const [x1, y1, x2, y2] = pos.bbox;
        if (canvasX >= x1 && canvasX <= x2 && canvasY >= y1 && canvasY <= y2) {
          e.preventDefault();
          onImageContextMenu(e, pageRef, pos.imageIndex);
          return;
        }
      }
      // If no image hit, let browser show default context menu
    },
    [onImageContextMenu, imagePositions, pageRef]
  );

  return (
    <canvas
      ref={canvasRef}
      className="min-h-[200px] max-w-full rounded shadow-sm"
      onContextMenu={handleContextMenu}
    />
  );
}
