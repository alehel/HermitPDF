"use client";

import { memo } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { PageStack, formatFileSize } from "@/lib/types";
import { CloseIcon, EyeIcon, EyeOffIcon } from "./Icons";
import { PdfThumbnail } from "./PdfThumbnail";

const stackLayerStyles = {
  lg: [
    "absolute inset-y-0 left-[9px] right-[-9px] rounded-lg border border-black/20 bg-card shadow-[2px_2px_6px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-white dark:shadow-[2px_2px_6px_rgba(0,0,0,0.3)]",
    "absolute inset-y-0 left-[6px] right-[-6px] rounded-lg border border-black/20 bg-card shadow-[2px_2px_5px_rgba(0,0,0,0.07)] dark:border-white/15 dark:bg-white dark:shadow-[2px_2px_5px_rgba(0,0,0,0.25)]",
    "absolute inset-y-0 left-[3px] right-[-3px] rounded-lg border border-black/20 bg-card shadow-[2px_2px_4px_rgba(0,0,0,0.06)] dark:border-white/15 dark:bg-white dark:shadow-[2px_2px_4px_rgba(0,0,0,0.2)]",
  ],
  sm: [
    "absolute inset-y-0 left-[6px] right-[-6px] rounded border border-black/20 bg-card shadow-[1px_1px_4px_rgba(0,0,0,0.08)] dark:border-white/15 dark:bg-white dark:shadow-[1px_1px_4px_rgba(0,0,0,0.25)]",
    "absolute inset-y-0 left-[4px] right-[-4px] rounded border border-black/20 bg-card shadow-[1px_1px_3px_rgba(0,0,0,0.07)] dark:border-white/15 dark:bg-white dark:shadow-[1px_1px_3px_rgba(0,0,0,0.2)]",
    "absolute inset-y-0 left-[2px] right-[-2px] rounded border border-black/20 bg-card shadow-[1px_1px_2px_rgba(0,0,0,0.06)] dark:border-white/15 dark:bg-white dark:shadow-[1px_1px_2px_rgba(0,0,0,0.15)]",
  ],
};

function StackedLayers({ size }: { size: "sm" | "lg" }) {
  return (
    <>
      {stackLayerStyles[size].map((cls, i) => (
        <div key={i} className={cls} />
      ))}
    </>
  );
}

function selectionBorderClass(isSelected: boolean | undefined, isDragging: boolean) {
  if (isSelected) {
    return "border-primary ring-2 ring-primary";
  }
  return "border-border" + (!isDragging ? " hover:border-primary/50" : "");
}

interface StackCardProps {
  stack: PageStack;
  index: number;
  layout: "list" | "grid";
  onRemove: (id: string) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onContextMenu: (e: React.MouseEvent, stackId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
  isSelected?: boolean;
  onClick?: (stackId: string, e: React.MouseEvent) => void;
}

export const StackCard = memo(function StackCard({
  stack,
  index,
  layout,
  onRemove,
  onDragStart,
  onDragEnd,
  isDragging,
  onContextMenu,
  isExpanded,
  onToggleExpand,
  isSelected,
  onClick,
}: StackCardProps) {
  const t = useTranslations("documentItem");
  const isStack = stack.pages.length > 1;

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/x-stack-index", String(index));
      onDragStart(index, e);
    },
    onDragEnd,
  };

  const contextMenuHandler = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, stack.id);
  };

  const expandButton = onToggleExpand && isStack && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand(stack.id);
      }}
      className={clsx(
        "shrink-0 cursor-pointer rounded p-1 text-muted-foreground transition-opacity hover:text-foreground",
        layout === "grid" && "bg-card/80 !p-0.5",
        isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
      title={isExpanded ? t("collapsePages") : t("expandPages")}
      aria-label={isExpanded ? t("collapsePages") : t("expandPages")}
      draggable={false}
    >
      {isExpanded ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  );

  const removeButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove(stack.id); }}
      className={clsx(
        "shrink-0 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100",
        layout === "grid" && "bg-card/80 !p-0.5"
      )}
      title={t("remove")}
      aria-label={t("remove")}
      draggable={false}
    >
      <CloseIcon />
    </button>
  );

  const handleClick = (e: React.MouseEvent) => onClick?.(stack.id, e);

  if (layout === "grid") {
    return (
      <div
        className={clsx(
          "group relative cursor-grab select-none transition-colors active:cursor-grabbing",
          isDragging && "opacity-0"
        )}
        onContextMenu={contextMenuHandler}
        onClick={handleClick}
        {...dragProps}
      >
        {isStack ? (
          <div className="relative">
            <StackedLayers size="lg" />
            {/* Front card */}
            <div className={clsx(
              "relative rounded-lg border bg-card p-2 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
              selectionBorderClass(isSelected, isDragging),
            )}>
              <div className="flex items-center justify-center overflow-hidden rounded">
                <PdfThumbnail pageRef={stack.pages[0]} width={140} />
              </div>
              <span className="absolute bottom-3 right-3 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-white shadow-sm">
                {stack.pages.length}
              </span>
            </div>
            <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5">
              {expandButton}
              {removeButton}
            </div>
          </div>
        ) : (
          <div className={clsx(
            "rounded-lg border bg-card p-2 shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
            selectionBorderClass(isSelected, isDragging),
          )}>
            <div className="flex items-center justify-center overflow-hidden rounded">
              <PdfThumbnail pageRef={stack.pages[0]} width={140} />
            </div>
            <div className="absolute right-1 top-1 flex items-center gap-0.5">
              {removeButton}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "group flex cursor-grab select-none items-center gap-2.5 rounded-lg p-2.5 transition-colors active:cursor-grabbing",
        isDragging ? "opacity-0" : "hover:bg-background",
        isSelected && "ring-2 ring-primary"
      )}
      onContextMenu={contextMenuHandler}
      onClick={handleClick}
      {...dragProps}
    >
      {isStack ? (
        <div className="relative shrink-0">
          <StackedLayers size="sm" />
          <div className="relative flex h-[56px] w-[44px] items-center justify-center overflow-hidden rounded border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <PdfThumbnail pageRef={stack.pages[0]} width={44} />
          </div>
          <span className="absolute bottom-0.5 right-[-2px] z-10 rounded-full bg-primary px-1 py-0.5 text-[9px] font-medium leading-none text-white shadow-sm">
            {stack.pages.length}
          </span>
        </div>
      ) : (
        <div className="flex h-[56px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
          <PdfThumbnail pageRef={stack.pages[0]} width={44} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {stack.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatFileSize(stack.size)}
        </p>
      </div>
      {expandButton}
      {removeButton}
    </div>
  );
});
