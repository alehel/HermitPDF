"use client";

import { useCallback } from "react";
import { useSortableDrag, SortableDragResult } from "./useSortableDrag";

interface UsePageBoxDragDropOptions {
  stackId: string;
  pageCount: number;
  boxRef: React.RefObject<HTMLDivElement | null>;
  onReorderPage: (
    stackId: string,
    fromPageIndex: number,
    toPageIndex: number
  ) => void;
  onInsertStackIntoExpanded: (
    targetStackId: string,
    sourceStackIndex: number,
    insertAtPageIndex: number
  ) => void;
  onMovePageBetweenStacks: (
    sourceStackId: string,
    sourcePageIndex: number,
    targetStackId: string,
    insertAtPageIndex: number
  ) => void;
  layout?: "list" | "grid";
}

interface PageBoxDragDropResult {
  pageDropIndex: number | null;
  pageDragIndex: number | null;
  isSameContainerDrag: boolean;
  handlePageDragOver: (e: React.DragEvent) => void;
  handlePageDragLeave: (e: React.DragEvent) => void;
  handlePageDrop: (e: React.DragEvent) => void;
  handlePageItemDragStart: (pageIndex: number, e: React.DragEvent) => void;
  handlePageItemDragEnd: () => void;
  getItemStyle: SortableDragResult["getItemStyle"];
  overlayElRef: SortableDragResult["overlayElRef"];
  overlayOriginPos: SortableDragResult["overlayOriginPos"];
}

export function usePageBoxDragDrop({
  stackId,
  pageCount,
  boxRef,
  onReorderPage,
  onInsertStackIntoExpanded,
  onMovePageBetweenStacks,
  layout = "list",
}: UsePageBoxDragDropOptions): PageBoxDragDropResult {
  const acceptDrag = useCallback(
    (e: React.DragEvent) =>
      e.dataTransfer.types.includes("text/x-page-drag") ||
      e.dataTransfer.types.includes("text/x-stack-index"),
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      // Page drag (from same or different stack)
      const pageDragData = e.dataTransfer.getData("text/x-page-drag");
      if (pageDragData) {
        const [sourceStackId, sourcePageStr] = pageDragData.split(":");
        const sourcePageIndex = parseInt(sourcePageStr, 10);

        if (sourceStackId === stackId) {
          if (sourcePageIndex !== toIndex && sourcePageIndex !== toIndex - 1) {
            onReorderPage(stackId, sourcePageIndex, toIndex);
          }
        } else {
          onMovePageBetweenStacks(sourceStackId, sourcePageIndex, stackId, toIndex);
        }
        return;
      }

      // Stack drag into expansion box
      const stackIndexStr = e.dataTransfer.getData("text/x-stack-index");
      if (stackIndexStr) {
        const sourceStackIndex = parseInt(stackIndexStr, 10);
        onInsertStackIntoExpanded(stackId, sourceStackIndex, toIndex);
      }
    },
    [stackId, onReorderPage, onInsertStackIntoExpanded, onMovePageBetweenStacks]
  );

  const sortable = useSortableDrag({
    itemCount: pageCount,
    containerRef: boxRef,
    itemSelector: "[data-page-item]",
    layout,
    acceptDrag,
    onDrop,
  });

  return {
    pageDropIndex: sortable.dropIndex,
    pageDragIndex: sortable.dragIndex,
    isSameContainerDrag: sortable.isSameContainerDrag,
    handlePageDragOver: sortable.handleDragOver,
    handlePageDragLeave: sortable.handleDragLeave,
    handlePageDrop: sortable.handleDrop,
    handlePageItemDragStart: sortable.handleItemDragStart,
    handlePageItemDragEnd: sortable.handleItemDragEnd,
    getItemStyle: sortable.getItemStyle,
    overlayElRef: sortable.overlayElRef,
    overlayOriginPos: sortable.overlayOriginPos,
  };
}
