"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "pw-preview-width";
const PREVIEW_KEY = "pw-preview-visible";
const MIN_LEFT = 260;
const MIN_RIGHT = 300;
const DEFAULT_PREVIEW_RATIO = 0.4;
const NARROW_THRESHOLD = 700;
const DIVIDER_WIDTH = 6;

export function useResizablePanel(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [previewWidth, setPreviewWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const initializedRef = useRef(false);

  const isNarrow = containerWidth > 0 && containerWidth < NARROW_THRESHOLD;

  // Resolve initial preview width on mount with fallback chain:
  // 1. localStorage (user's last drag position), clamped to current container
  // 2. 40% of measured container width (first-time visit with DOM ready)
  // 3. 400px hardcoded fallback (SSR or if container hasn't mounted yet)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const el = containerRef.current;
    const cw = el ? el.getBoundingClientRect().width : 0;
    const stored = localStorage.getItem(STORAGE_KEY);
    // A non-numeric stored value would turn the clamp into NaN and break the
    // panel layout, so fall through to the ratio/default branches instead.
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isNaN(parsed)) {
      const maxPreview = cw > 0 ? cw - MIN_LEFT - DIVIDER_WIDTH : parsed;
      setPreviewWidth(Math.min(maxPreview, Math.max(MIN_RIGHT, parsed)));
    } else if (cw > 0) {
      setPreviewWidth(Math.max(MIN_RIGHT, Math.floor(cw * DEFAULT_PREVIEW_RATIO)));
    } else {
      setPreviewWidth(400);
    }

    const storedPreview = localStorage.getItem(PREVIEW_KEY);
    if (storedPreview !== null) {
      setPreviewVisible(storedPreview !== "false");
    }
  }, [containerRef]);

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const togglePreview = useCallback(() => {
    setPreviewVisible((v) => {
      const next = !v;
      localStorage.setItem(PREVIEW_KEY, String(next));
      return next;
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button for mouse; always accept for touch/pen
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startWidth = previewWidth;
      setIsResizing(true);

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      function onPointerMove(ev: PointerEvent) {
        const container = containerRef.current;
        if (!container) return;
        const cw = container.getBoundingClientRect().width;
        const maxPreview = cw - MIN_LEFT - DIVIDER_WIDTH;
        // Dragging right = smaller preview, dragging left = larger preview
        const newWidth = Math.min(maxPreview, Math.max(MIN_RIGHT, startWidth - (ev.clientX - startX)));
        setPreviewWidth(newWidth);
      }

      function onPointerUp() {
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onPointerUp);
        target.removeEventListener("pointercancel", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);
        // Read the final width via setState updater to avoid a stale closure
        // over the value from dragstart — the width changes on every pointermove.
        setPreviewWidth((currentWidth) => {
          localStorage.setItem(STORAGE_KEY, String(currentWidth));
          return currentWidth;
        });
      }

      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", onPointerUp);
      target.addEventListener("pointercancel", onPointerUp);
    },
    [previewWidth, containerRef]
  );

  return {
    previewWidth,
    handlePointerDown,
    isResizing,
    previewVisible,
    togglePreview,
    isNarrow,
    containerWidth,
  };
}
