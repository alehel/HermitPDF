"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PageListItem } from "./PageListItem";
import { DropIndicator, DropIndicatorVertical } from "./DropIndicators";
import { DragOverlay } from "./DragOverlay";
import { usePageBoxDragDrop } from "@/hooks/usePageBoxDragDrop";
import { PageRef } from "@/lib/types";

interface PageExpansionBoxProps {
  stackId: string;
  pages: PageRef[];
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
  onPageContextMenu?: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  variant?: "list" | "grid";
  parentCardElement?: HTMLElement | null;
  focusedPageId?: string | null;
  focusLevel?: "stack" | "page";
  onScrollToPage?: (pageId: string) => void;
  thumbnailVersions?: Map<string, number>;
}

export const PageExpansionBox = memo(function PageExpansionBox({
  stackId,
  pages,
  onReorderPage,
  onInsertStackIntoExpanded,
  onMovePageBetweenStacks,
  onPageContextMenu,
  variant = "list",
  parentCardElement,
  focusedPageId,
  focusLevel,
  onScrollToPage,
  thumbnailVersions,
}: PageExpansionBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [notchLeft, setNotchLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (variant !== "grid" || !parentCardElement || !boxRef.current) return;
    const cardRect = parentCardElement.getBoundingClientRect();
    const boxRect = boxRef.current.getBoundingClientRect();
    setNotchLeft(cardRect.left + cardRect.width / 2 - boxRect.left);
  }, [variant, parentCardElement, stackId]);

  const {
    pageDropIndex,
    pageDragIndex,
    isSameContainerDrag,
    handlePageDragOver,
    handlePageDragLeave,
    handlePageDrop,
    handlePageItemDragStart,
    handlePageItemDragEnd,
    getItemStyle,
    overlayElRef,
    overlayOriginPos,
  } = usePageBoxDragDrop({
    stackId,
    pageCount: pages.length,
    boxRef,
    onReorderPage,
    onInsertStackIntoExpanded,
    onMovePageBetweenStacks,
    layout: variant,
  });

  const isGrid = variant === "grid";

  return (
    <div className="relative mb-2 mt-1">
      {isGrid && notchLeft !== null && (
        <div
          className="absolute -top-[8px] z-10"
          style={{ left: notchLeft - 8 }}
        >
          <div className="h-0 w-0 border-b-[8px] border-l-[8px] border-r-[8px] border-b-border border-l-transparent border-r-transparent" />
          <div
            className="absolute left-[1px] top-[1px] h-0 w-0 border-b-[7px] border-l-[7px] border-r-[7px] border-b-background border-l-transparent border-r-transparent"
          />
        </div>
      )}
      <div
        ref={boxRef}
        data-expansion-box
        className={clsx(
          "rounded-lg border border-border bg-background p-2 transition-colors",
          pageDropIndex !== null && !isSameContainerDrag && "bg-accent/40"
        )}
        onDragOver={handlePageDragOver}
        onDragLeave={handlePageDragLeave}
        onDrop={handlePageDrop}
      >
        {isGrid ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-1">
            {pages.map((pageRef, i) => (
              <div key={pageRef.id} className="relative">
                {!isSameContainerDrag && pageDropIndex === i && <DropIndicatorVertical />}
                <PageListItem
                  pageRef={pageRef}
                  stackId={stackId}
                  pageIndex={i}
                  onDragStart={handlePageItemDragStart}
                  onDragEnd={handlePageItemDragEnd}
                  isDragging={pageDragIndex === i}
                  onContextMenu={onPageContextMenu}
                  layout="tile"
                  style={getItemStyle(i)}
                  isFocused={focusLevel === "stack" || focusedPageId === pageRef.id}
                  onClick={onScrollToPage}
                  version={thumbnailVersions?.get(pageRef.id)}
                />
              </div>
            ))}
            {!isSameContainerDrag && pageDropIndex === pages.length && pages.length > 0 && (
              <div className="relative">
                <DropIndicatorVertical />
              </div>
            )}
          </div>
        ) : (
          <>
            {pages.map((pageRef, i) => (
              <div key={pageRef.id}>
                {!isSameContainerDrag && pageDropIndex === i && <DropIndicator />}
                <PageListItem
                  pageRef={pageRef}
                  stackId={stackId}
                  pageIndex={i}
                  onDragStart={handlePageItemDragStart}
                  onDragEnd={handlePageItemDragEnd}
                  isDragging={pageDragIndex === i}
                  onContextMenu={onPageContextMenu}
                  style={getItemStyle(i)}
                  isFocused={focusLevel === "stack" || focusedPageId === pageRef.id}
                  onClick={onScrollToPage}
                  version={thumbnailVersions?.get(pageRef.id)}
                />
              </div>
            ))}
            {!isSameContainerDrag && pageDropIndex === pages.length && <DropIndicator />}
          </>
        )}
      </div>

      {pageDragIndex !== null && (
        <DragOverlay
          pageRef={pages[pageDragIndex]}
          pageIndex={pageDragIndex}
          overlayElRef={overlayElRef}
          layout={isGrid ? "tile" : "row"}
          initialPos={overlayOriginPos}
        />
      )}
    </div>
  );
});
