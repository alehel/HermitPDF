"use client";

import { useCallback } from "react";
import { useSortableDrag, SortableDragResult } from "./useSortableDrag";

interface UsePanelDragDropOptions {
  stackCount: number;
  listRef: React.RefObject<HTMLDivElement | null>;
  onFilesAdded: (files: FileList, insertAtIndex?: number) => Promise<void>;
  onReorderStack: (fromIndex: number, toIndex: number) => void;
  onExtractPageToList?: (sourceStackId: string, pageIndex: number, insertAtStackIndex: number) => void;
  viewMode?: "list" | "grid";
}

interface PanelDragDropResult {
  dropIndex: number | null;
  dragIndex: number | null;
  isSameContainerDrag: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleItemDragStart: (index: number, e: React.DragEvent) => void;
  handleItemDragEnd: () => void;
  getItemStyle: SortableDragResult["getItemStyle"];
  overlayElRef: SortableDragResult["overlayElRef"];
  overlayOriginPos: SortableDragResult["overlayOriginPos"];
}

export function usePanelDragDrop({
  stackCount,
  listRef,
  onFilesAdded,
  onReorderStack,
  onExtractPageToList,
  viewMode = "list",
}: UsePanelDragDropOptions): PanelDragDropResult {
  const onDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      const fromIndexStr = e.dataTransfer.getData("text/x-stack-index");
      if (fromIndexStr) {
        const fromIndex = parseInt(fromIndexStr, 10);
        if (fromIndex !== toIndex && fromIndex !== toIndex - 1) {
          onReorderStack(fromIndex, toIndex);
        }
        return;
      }

      const pageDragData = e.dataTransfer.getData("text/x-page-drag");
      if (pageDragData && onExtractPageToList) {
        const [sourceStackId, sourcePageStr] = pageDragData.split(":");
        const sourcePageIndex = parseInt(sourcePageStr, 10);
        onExtractPageToList(sourceStackId, sourcePageIndex, toIndex);
        return;
      }

      if (e.dataTransfer.files.length > 0) {
        onFilesAdded(e.dataTransfer.files, toIndex);
      }
    },
    [onFilesAdded, onReorderStack, onExtractPageToList]
  );

  // Don't show panel drop indicators for page drags inside expansion boxes
  const acceptDrag = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/x-page-drag")) {
      const target = e.target as HTMLElement;
      if (target.closest?.("[data-expansion-box]")) return false;
    }
    return true;
  }, []);

  const getDropEffect = useCallback(
    (e: React.DragEvent): DataTransfer["dropEffect"] => {
      const isInternal = e.dataTransfer.types.includes("text/x-stack-index");
      const isPageDrag = e.dataTransfer.types.includes("text/x-page-drag");
      return isInternal || isPageDrag ? "move" : "copy";
    },
    []
  );

  const sortable = useSortableDrag({
    itemCount: stackCount,
    containerRef: listRef,
    itemSelector: "[data-doc-item]",
    layout: viewMode,
    acceptDrag,
    onDrop,
    getDropEffect,
  });

  return {
    dropIndex: sortable.dropIndex,
    dragIndex: sortable.dragIndex,
    isSameContainerDrag: sortable.isSameContainerDrag,
    handleDragOver: sortable.handleDragOver,
    handleDragLeave: sortable.handleDragLeave,
    handleDrop: sortable.handleDrop,
    handleItemDragStart: sortable.handleItemDragStart,
    handleItemDragEnd: sortable.handleItemDragEnd,
    getItemStyle: sortable.getItemStyle,
    overlayElRef: sortable.overlayElRef,
    overlayOriginPos: sortable.overlayOriginPos,
  };
}
