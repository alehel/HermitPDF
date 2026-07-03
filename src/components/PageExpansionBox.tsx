"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PageListItem } from "./PageListItem";
import { PageRef } from "@/lib/types";

interface PageExpansionBoxProps {
  stackId: string;
  pages: PageRef[];
  onPageContextMenu?: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  variant?: "list" | "grid";
  parentCardElement?: HTMLElement | null;
  selectedPageIds: Set<string>;
  onPageClick?: (pageId: string, e: React.MouseEvent) => void;
}

export const PageExpansionBox = memo(function PageExpansionBox({
  stackId,
  pages,
  onPageContextMenu,
  variant = "list",
  parentCardElement,
  selectedPageIds,
  onPageClick,
}: PageExpansionBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [notchLeft, setNotchLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (variant !== "grid" || !parentCardElement || !boxRef.current) return;
    const cardRect = parentCardElement.getBoundingClientRect();
    const boxRect = boxRef.current.getBoundingClientRect();
    setNotchLeft(cardRect.left + cardRect.width / 2 - boxRect.left);
  }, [variant, parentCardElement, stackId]);

  const isGrid = variant === "grid";
  const pageIds = pages.map((p) => p.id);

  return (
    <div className="relative mb-2 mt-1">
      {isGrid && notchLeft !== null && (
        <div
          className="absolute -top-[8px] z-10"
          style={{ left: notchLeft - 8 }}
        >
          <div className="h-0 w-0 border-b-[8px] border-l-[8px] border-r-[8px] border-b-border border-l-transparent border-r-transparent" />
          <div
            className="absolute left-[1px] top-[1px] h-0 w-0 border-b-[7px] border-l-[7px] border-r-[7px] border-b-card border-l-transparent border-r-transparent"
          />
        </div>
      )}
      <div
        ref={boxRef}
        data-expansion-box
        data-stack-id={stackId}
        className={clsx(
          "rounded-lg border border-border bg-card p-2 transition-colors",
        )}
      >
        <SortableContext
          items={pageIds}
          strategy={isGrid ? rectSortingStrategy : verticalListSortingStrategy}
        >
          {isGrid ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-1">
              {pages.map((pageRef, i) => (
                <PageListItem
                  key={pageRef.id}
                  pageRef={pageRef}
                  stackId={stackId}
                  pageIndex={i}
                  onContextMenu={onPageContextMenu}
                  layout="tile"
                  isFocused={selectedPageIds.has(pageRef.id)}
                  onClick={onPageClick}
                />
              ))}
            </div>
          ) : (
            <>
              {pages.map((pageRef, i) => (
                <PageListItem
                  key={pageRef.id}
                  pageRef={pageRef}
                  stackId={stackId}
                  pageIndex={i}
                  onContextMenu={onPageContextMenu}
                  isFocused={selectedPageIds.has(pageRef.id)}
                  onClick={onPageClick}
                />
              ))}
            </>
          )}
        </SortableContext>
      </div>
    </div>
  );
});
