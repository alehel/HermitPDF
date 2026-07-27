"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  clampSplit,
  MIN_CROP_FRACTION,
  type CropRect,
} from "@/lib/bookscan";

type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "split";

interface CropEditorProps {
  /** Rendered source page; null shows an empty frame while loading. */
  imageData: ImageData | null;
  crop: CropRect;
  /** Gutter position (fraction of full page width), or null to hide the line. */
  split: number | null;
  splitLabel?: string;
  onCropChange: (crop: CropRect) => void;
  onSplitChange: (split: number) => void;
}

const HANDLE = "absolute h-3 w-3 rounded-sm border border-primary bg-background";

/**
 * Canvas preview of a scanned page with a draggable crop rectangle and, for
 * spreads, a draggable gutter line. All geometry is in fractions of the page,
 * so the parent can hand values straight to the export without conversion.
 */
export function CropEditor({
  imageData,
  crop,
  split,
  splitLabel,
  onCropChange,
  onSplitChange,
}: CropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
    startSplit: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d")?.putImageData(imageData, 0, 0);
  }, [imageData]);

  const beginDrag = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startCrop: crop,
        startSplit: split ?? 0,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [crop, split]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const overlay = overlayRef.current;
      if (!drag || !overlay) return;
      const rect = overlay.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const c = drag.startCrop;

      if (drag.mode === "split") {
        onSplitChange(clampSplit(drag.startSplit + dx, crop));
        return;
      }

      if (drag.mode === "move") {
        const w = c.x1 - c.x0;
        const h = c.y1 - c.y0;
        const x0 = Math.min(Math.max(c.x0 + dx, 0), 1 - w);
        const y0 = Math.min(Math.max(c.y0 + dy, 0), 1 - h);
        onCropChange({ x0, y0, x1: x0 + w, y1: y0 + h });
        return;
      }

      // Edge/corner resize: move only the sides named by the mode, keeping
      // each at least MIN_CROP_FRACTION away from its opposite side.
      const next = { ...c };
      if (drag.mode.includes("w"))
        next.x0 = Math.min(Math.max(c.x0 + dx, 0), c.x1 - MIN_CROP_FRACTION);
      if (drag.mode.includes("e"))
        next.x1 = Math.max(Math.min(c.x1 + dx, 1), c.x0 + MIN_CROP_FRACTION);
      if (drag.mode.includes("n"))
        next.y0 = Math.min(Math.max(c.y0 + dy, 0), c.y1 - MIN_CROP_FRACTION);
      if (drag.mode.includes("s"))
        next.y1 = Math.max(Math.min(c.y1 + dy, 1), c.y0 + MIN_CROP_FRACTION);
      onCropChange(next);
    },
    [crop, onCropChange, onSplitChange]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
      <canvas
        ref={canvasRef}
        className="block w-full"
        style={{ maxHeight: "70vh", objectFit: "contain" }}
      />

      <div
        ref={overlayRef}
        className="absolute inset-0 touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Crop rectangle. The huge box-shadow dims everything outside it —
            the container's overflow-hidden clips the spill. */}
        <div
          className="absolute cursor-move border-2 border-primary"
          style={{
            left: pct(crop.x0),
            top: pct(crop.y0),
            width: pct(crop.x1 - crop.x0),
            height: pct(crop.y1 - crop.y0),
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
          onPointerDown={beginDrag("move")}
        >
          {/* Edge grab zones */}
          <div className="absolute -top-1.5 left-3 right-3 h-3 cursor-ns-resize" onPointerDown={beginDrag("n")} />
          <div className="absolute -bottom-1.5 left-3 right-3 h-3 cursor-ns-resize" onPointerDown={beginDrag("s")} />
          <div className="absolute -left-1.5 top-3 bottom-3 w-3 cursor-ew-resize" onPointerDown={beginDrag("w")} />
          <div className="absolute -right-1.5 top-3 bottom-3 w-3 cursor-ew-resize" onPointerDown={beginDrag("e")} />
          {/* Corner handles */}
          <div className={`${HANDLE} -left-1.5 -top-1.5 cursor-nwse-resize`} onPointerDown={beginDrag("nw")} />
          <div className={`${HANDLE} -right-1.5 -top-1.5 cursor-nesw-resize`} onPointerDown={beginDrag("ne")} />
          <div className={`${HANDLE} -left-1.5 -bottom-1.5 cursor-nesw-resize`} onPointerDown={beginDrag("sw")} />
          <div className={`${HANDLE} -right-1.5 -bottom-1.5 cursor-nwse-resize`} onPointerDown={beginDrag("se")} />
        </div>

        {/* Gutter split line for spreads */}
        {split !== null && (
          <div
            className="absolute cursor-ew-resize"
            style={{
              left: `calc(${pct(clampSplit(split, crop))} - 6px)`,
              top: pct(crop.y0),
              height: pct(crop.y1 - crop.y0),
              width: 12,
            }}
            onPointerDown={beginDrag("split")}
          >
            <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary" />
            {splitLabel && (
              <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                {splitLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
