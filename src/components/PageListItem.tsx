"use client";

import { memo } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PdfThumbnail } from "./PdfThumbnail";
import { PageRef } from "@/lib/types";

interface PageListItemProps {
  pageRef: PageRef;
  stackId: string;
  pageIndex: number;
  onContextMenu?: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  layout?: "row" | "tile";
  isFocused?: boolean;
  onClick?: (pageId: string, e: React.MouseEvent) => void;
}

export const PageListItem = memo(function PageListItem({
  pageRef,
  stackId,
  pageIndex,
  onContextMenu,
  layout = "row",
  isFocused,
  onClick,
}: PageListItemProps) {
  const t = useTranslations("documentItem");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: pageRef.id,
    data: { type: "page", stackId, pageIndex, pageId: pageRef.id },
  });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
    touchAction: "none",
  };

  const contextMenuHandler = onContextMenu
    ? (e: React.MouseEvent) => { e.preventDefault(); onContextMenu(e, stackId, pageIndex); }
    : undefined;

  const handleClick = (e: React.MouseEvent) => onClick?.(pageRef.id, e);

  if (layout === "tile") {
    return (
      <div
        ref={setNodeRef}
        style={dragStyle}
        className={clsx(
          "flex cursor-grab select-none flex-col items-center rounded-md p-1.5 transition-colors active:cursor-grabbing",
          isDragging ? "opacity-0" : "hover:bg-card",
        )}
        onContextMenu={contextMenuHandler}
        onClick={handleClick}
        {...attributes}
        {...listeners}
      >
        <div className={clsx(
          "flex items-center justify-center overflow-hidden rounded border border-border bg-card",
          isFocused && "ring-2 ring-primary"
        )}>
          <PdfThumbnail pageRef={pageRef} width={80} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("pageLabel", { page: pageIndex + 1 })}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={clsx(
        "flex cursor-grab select-none items-center gap-2 rounded-md p-1.5 transition-colors active:cursor-grabbing",
        isDragging ? "opacity-0" : "hover:bg-card",
      )}
      onContextMenu={contextMenuHandler}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <div className={clsx(
        "flex h-[46px] w-[36px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card",
        isFocused && "ring-2 ring-primary"
      )}>
        <PdfThumbnail pageRef={pageRef} width={36} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("pageLabel", { page: pageIndex + 1 })}
      </p>
    </div>
  );
});
