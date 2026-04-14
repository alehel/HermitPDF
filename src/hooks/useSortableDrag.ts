"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ItemRect,
  calcDropIndex as calcDropIndexUtil,
  calcItemTransforms,
  snapshotItemRects,
} from "@/lib/dragDropUtils";

export interface UseSortableDragOptions {
  itemCount: number;
  containerRef: React.RefObject<HTMLElement | null>;
  itemSelector: string;
  layout: "list" | "grid";
  /** Return true to accept the drag (show drop indicator / transforms). Default: accept all. */
  acceptDrag?: (e: React.DragEvent) => boolean;
  /** Called with the final drop index after state is cleared. */
  onDrop: (e: React.DragEvent, toIndex: number) => void;
  /** Whether dragover/drop call stopPropagation (needed for nested containers). */
  stopPropagation?: boolean;
  /** Override the drop effect shown during dragover. Default: "move". */
  getDropEffect?: (e: React.DragEvent) => DataTransfer["dropEffect"];
}

export interface SortableDragResult {
  dropIndex: number | null;
  dragIndex: number | null;
  isSameContainerDrag: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleItemDragStart: (index: number, e: React.DragEvent) => void;
  handleItemDragEnd: () => void;
  getItemStyle: (index: number) => React.CSSProperties | undefined;
  overlayElRef: React.RefObject<HTMLDivElement | null>;
  overlayOriginPos: { x: number; y: number } | null;
}

// Stable style objects — reused across renders to preserve reference equality
// and avoid breaking memo() on child components.
const STYLE_DRAGGED: React.CSSProperties = { opacity: 0, transition: "opacity 0ms" };
const STYLE_TRANSITION: React.CSSProperties = { transition: "transform 200ms ease" };

function suppressNativeDragImage(dataTransfer: DataTransfer): void {
  const ghost = document.createElement("div");
  ghost.style.cssText =
    "position:absolute;top:-9999px;width:1px;height:1px;opacity:0.01";
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 0, 0);
  requestAnimationFrame(() => ghost.remove());
}

export function useSortableDrag({
  itemCount,
  containerRef,
  itemSelector,
  layout,
  acceptDrag,
  onDrop,
  stopPropagation = false,
  getDropEffect,
}: UseSortableDragOptions): SortableDragResult {
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const cachedRects = useRef<ItemRect[]>([]);
  const dropIndexRef = useRef<number | null>(null);

  // Overlay positioning — mutated directly via DOM, no React re-renders
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [overlayOriginPos, setOverlayInitialPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // If itemCount changes during a drag (e.g. a page was extracted to the panel),
  // the dragged item may have been unmounted — clear stale drag state.
  const prevItemCount = useRef(itemCount);
  useEffect(() => {
    if (prevItemCount.current !== itemCount && dragIndex !== null) {
      setDragIndex(null);
      setDropIndex(null);
      setOverlayInitialPos(null);
      dropIndexRef.current = null;
      cachedRects.current = [];
    }
    prevItemCount.current = itemCount;
  }, [itemCount, dragIndex]);

  const snapshotRects = useCallback(() => {
    if (!containerRef.current) return;
    cachedRects.current = snapshotItemRects(containerRef.current, itemSelector);
  }, [containerRef, itemSelector]);

  const calcDropIndex = useCallback(
    (clientX: number, clientY: number) =>
      calcDropIndexUtil(cachedRects.current, itemCount, layout, clientX, clientY),
    [itemCount, layout]
  );

  // Global dragover listener to track overlay position + throttled scroll re-snapshot
  useEffect(() => {
    if (dragIndex === null) return;

    const onDragOver = (e: DragEvent) => {
      if (overlayElRef.current) {
        const x = e.clientX - dragOffsetRef.current.x;
        const y = e.clientY - dragOffsetRef.current.y;
        overlayElRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
    };

    let scrollRafId = 0;
    const onScroll = () => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0;
        snapshotRects();
      });
    };

    document.addEventListener("dragover", onDragOver);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("dragover", onDragOver);
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
    };
  }, [dragIndex, snapshotRects]);

  // Compute item transforms when drag/drop indices change
  const transforms = useMemo(() => {
    if (dragIndex === null || dropIndex === null) return null;
    return calcItemTransforms(cachedRects.current, dragIndex, dropIndex, layout);
  }, [dragIndex, dropIndex, layout]);

  // Pre-compute stable style objects per item. Items that don't move get
  // the same constant object reference, preserving memo() on children.
  const itemStyles = useMemo(() => {
    if (dragIndex === null) return null;

    const styles: (React.CSSProperties | undefined)[] = new Array(itemCount);
    for (let i = 0; i < itemCount; i++) {
      if (i === dragIndex) {
        styles[i] = STYLE_DRAGGED;
      } else if (!transforms) {
        styles[i] = STYLE_TRANSITION;
      } else {
        const offset = transforms[i];
        if (!offset || (offset.x === 0 && offset.y === 0)) {
          styles[i] = STYLE_TRANSITION;
        } else {
          styles[i] = {
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: "transform 200ms ease",
          };
        }
      }
    }
    return styles;
  }, [dragIndex, transforms, itemCount]);

  const getItemStyle = useCallback(
    (index: number): React.CSSProperties | undefined => {
      return itemStyles?.[index];
    },
    [itemStyles]
  );

  const isSameContainerDrag = dragIndex !== null;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (acceptDrag && !acceptDrag(e)) return;
      e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      e.dataTransfer.dropEffect = getDropEffect ? getDropEffect(e) : "move";
      const idx = calcDropIndex(e.clientX, e.clientY);
      if (idx !== dropIndexRef.current) {
        dropIndexRef.current = idx;
        setDropIndex(idx);
      }
    },
    [calcDropIndex, acceptDrag, stopPropagation, getDropEffect]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.relatedTarget as Node)
      ) {
        dropIndexRef.current = null;
        setDropIndex(null);
      }
    },
    [containerRef]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (acceptDrag && !acceptDrag(e)) return;
      e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      const toIndex = calcDropIndex(e.clientX, e.clientY);
      dropIndexRef.current = null;
      setDropIndex(null);
      setDragIndex(null);
      setOverlayInitialPos(null);
      cachedRects.current = [];
      onDrop(e, toIndex);
    },
    [calcDropIndex, onDrop, stopPropagation, acceptDrag]
  );

  const initializeDragOffset = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const rects = cachedRects.current;
      if (!rects[index]) return;
      dragOffsetRef.current = {
        x: clientX - rects[index].left,
        y: clientY - rects[index].top,
      };
      setOverlayInitialPos({
        x: clientX - dragOffsetRef.current.x,
        y: clientY - dragOffsetRef.current.y,
      });
    },
    []
  );

  const handleItemDragStart = useCallback(
    (index: number, e: React.DragEvent) => {
      setDragIndex(index);
      snapshotRects();
      initializeDragOffset(index, e.clientX, e.clientY);
      suppressNativeDragImage(e.dataTransfer);
    },
    [snapshotRects, initializeDragOffset]
  );

  const handleItemDragEnd = useCallback(() => {
    dropIndexRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
    setOverlayInitialPos(null);
    cachedRects.current = [];
  }, []);

  return {
    dropIndex,
    dragIndex,
    isSameContainerDrag,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleItemDragStart,
    handleItemDragEnd,
    getItemStyle,
    overlayElRef,
    overlayOriginPos,
  };
}
