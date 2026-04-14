"use client";

import { memo } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { PdfThumbnail } from "./PdfThumbnail";
import { PageRef } from "@/lib/types";

interface PageListItemProps {
  pageRef: PageRef;
  stackId: string;
  pageIndex: number;
  onDragStart: (pageIndex: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onContextMenu?: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  layout?: "row" | "tile";
  style?: React.CSSProperties;
  isFocused?: boolean;
  onClick?: (pageId: string) => void;
  version?: number;
}

export const PageListItem = memo(function PageListItem({
  pageRef,
  stackId,
  pageIndex,
  onDragStart,
  onDragEnd,
  isDragging,
  onContextMenu,
  layout = "row",
  style,
  isFocused,
  onClick,
  version,
}: PageListItemProps) {
  const t = useTranslations("documentItem");

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/x-page-drag",
        `${stackId}:${pageIndex}`
      );
      onDragStart(pageIndex, e);
    },
    onDragEnd,
  };

  const contextMenuHandler = onContextMenu
    ? (e: React.MouseEvent) => { e.preventDefault(); onContextMenu(e, stackId, pageIndex); }
    : undefined;

  const handleClick = () => onClick?.(pageRef.id);

  if (layout === "tile") {
    return (
      <div
        data-page-item
        className={clsx(
          "flex cursor-grab select-none flex-col items-center rounded-md p-1.5 transition-colors active:cursor-grabbing",
          isDragging ? "opacity-0" : "hover:bg-card",
          isFocused && "ring-2 ring-primary"
        )}
        style={style}
        onContextMenu={contextMenuHandler}
        onClick={handleClick}
        {...dragProps}
      >
        <div className="flex items-center justify-center overflow-hidden rounded border border-border bg-card">
          <PdfThumbnail
            pageRef={pageRef}
            width={80}
            version={version}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("pageLabel", { page: pageIndex + 1 })}
        </p>
      </div>
    );
  }

  return (
    <div
      data-page-item
      className={clsx(
        "flex cursor-grab select-none items-center gap-2 rounded-md p-1.5 transition-colors active:cursor-grabbing",
        isDragging ? "opacity-0" : "hover:bg-card",
        isFocused && "ring-2 ring-primary"
      )}
      style={style}
      onContextMenu={contextMenuHandler}
      onClick={handleClick}
      {...dragProps}
    >
      <div className="flex h-[46px] w-[36px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card">
        <PdfThumbnail
          pageRef={pageRef}
          width={36}
          version={version}
        />
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("pageLabel", { page: pageIndex + 1 })}
      </p>
    </div>
  );
});
