"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { PageStack } from "@/lib/types";
import { StackCard } from "./StackCard";
import { PageExpansionBox } from "./PageExpansionBox";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { SplitIcon, DownloadIcon, ImageIcon } from "./Icons";
import { DropZone } from "./DropZone";
import { DropIndicator, DropIndicatorVertical } from "./DropIndicators";
import { StackDragOverlay } from "./StackDragOverlay";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { Fragment, useCallback, useRef } from "react";
import { usePanelDragDrop } from "@/hooks/usePanelDragDrop";

interface StackPanelProps {
  stacks: PageStack[];
  onFilesAdded: (files: FileList, insertAtIndex?: number) => Promise<void>;
  onBrowseFiles: () => void;
  onRemoveStack: (id: string) => void;
  onReorderStack: (fromIndex: number, toIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, stackId: string) => void;
  onPageContextMenu: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  onSplitStack: (id: string) => void;
  contextMenu: { x: number; y: number; stackId: string; pageIndex?: number } | null;
  onCloseContextMenu: () => void;
  style?: React.CSSProperties;
  viewMode: "list" | "grid";
  previewVisible?: boolean;
  expandedStackIds?: Set<string>;
  onToggleExpand?: (stackId: string) => void;
  onReorderPage?: (stackId: string, fromPageIndex: number, toPageIndex: number) => void;
  onExtractPageToList?: (sourceStackId: string, pageIndex: number, insertAtStackIndex: number) => void;
  onInsertStackIntoExpanded?: (targetStackId: string, sourceStackIndex: number, insertAtPageIndex: number) => void;
  onMovePageBetweenStacks?: (sourceStackId: string, sourcePageIndex: number, targetStackId: string, insertAtPageIndex: number) => void;
  selectedPageIds: Set<string>;
  onPageClick: (pageId: string, e: React.MouseEvent) => void;
  onStackClick: (stackId: string, e: React.MouseEvent) => void;
  thumbnailVersions?: Map<string, number>;
  onExtractPageImages?: (stackId: string, pageIndex: number) => void;
  onExtractStackImages?: (stackId: string) => void;
  onDeselect?: () => void;
}

/** Build context menu items for a right-clicked stack (not a page). */
function buildStackContextMenuItems(
  stack: PageStack | undefined,
  stackId: string,
  onSplitStack: (id: string) => void,
  onExtractStackImages: ((stackId: string) => void) | undefined,
  tItem: (key: string) => string
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (stack && stack.pages.length > 1) {
    items.push({
      label: tItem("splitIntoPages"),
      icon: <SplitIcon />,
      onClick: () => onSplitStack(stackId),
    });
  }

  items.push({
    label: tItem(stack && stack.pages.length > 1 ? "downloadStack" : "downloadPage"),
    icon: <DownloadIcon />,
    onClick: async () => {
      if (!stack) return;
      const bytes = await exportMergedPdf([stack]);
      downloadPdf(bytes, stack.name);
    },
  });

  if (onExtractStackImages) {
    items.push({
      label: tItem("extractStackImages"),
      icon: <ImageIcon />,
      onClick: () => onExtractStackImages(stackId),
    });
  }

  return items;
}

/** Build context menu items for a right-clicked page within a stack. */
function buildPageContextMenuItems(
  stack: PageStack | undefined,
  pageIndex: number,
  onExtractPageImages: ((stackId: string, pageIndex: number) => void) | undefined,
  tItem: (key: string) => string
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  items.push({
    label: tItem("downloadPage"),
    icon: <DownloadIcon />,
    onClick: async () => {
      if (!stack) return;
      const pageRef = stack.pages[pageIndex];
      const tempStack = { id: "temp", pages: [pageRef], name: stack.name, size: 0 };
      const stem = stack.name.replace(/\.pdf$/i, "");
      const bytes = await exportMergedPdf([tempStack]);
      downloadPdf(bytes, `${stem}_page${pageIndex + 1}.pdf`);
    },
  });

  if (onExtractPageImages && stack) {
    items.push({
      label: tItem("extractPageImages"),
      icon: <ImageIcon />,
      onClick: () => onExtractPageImages(stack.id, pageIndex),
    });
  }

  return items;
}


export function StackPanel({
  stacks,
  onFilesAdded,
  onBrowseFiles,
  onRemoveStack,
  onReorderStack,
  onContextMenu,
  onPageContextMenu,
  onSplitStack,
  contextMenu,
  onCloseContextMenu,
  style,
  viewMode,
  previewVisible,
  expandedStackIds,
  onToggleExpand,
  onReorderPage,
  onExtractPageToList,
  onInsertStackIntoExpanded,
  onMovePageBetweenStacks,
  selectedPageIds,
  onPageClick,
  onStackClick,
  thumbnailVersions,
  onExtractPageImages,
  onExtractStackImages,
  onDeselect,
}: StackPanelProps) {
  const tItem = useTranslations("documentItem");
  const t = useTranslations("documentPanel");
  const listRef = useRef<HTMLDivElement>(null);
  const gridCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const {
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
  } = usePanelDragDrop({
    stackCount: stacks.length,
    listRef,
    onFilesAdded,
    onReorderStack,
    onExtractPageToList,
    viewMode,
  });

  const handleCardClick = onStackClick;

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-doc-item], [data-expansion-box]")) {
      onDeselect?.();
    }
  }, [onDeselect]);

  return (
    <aside suppressHydrationWarning style={style} className={clsx("flex min-w-0 flex-col bg-background", previewVisible !== false && "border-r border-border")}>
      <div
        ref={listRef}
        className={clsx(
          "flex-1 overflow-y-auto p-4 transition-colors",
          dropIndex !== null && !isSameContainerDrag && "bg-accent/40"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBackgroundClick}
      >
        {stacks.length === 0 ? (
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={onBrowseFiles}
            fill
          />
        ) : viewMode === "list" ? (
          <ul>
            {stacks.map((stack, i) => (
              <li key={stack.id} data-doc-item className="list-none" style={getItemStyle(i)}>
                {!isSameContainerDrag && dropIndex === i && <DropIndicator />}
                <StackCard
                  stack={stack}
                  index={i}
                  layout="list"
                  onRemove={onRemoveStack}
                  onDragStart={handleItemDragStart}
                  onDragEnd={handleItemDragEnd}
                  isDragging={dragIndex === i}
                  onContextMenu={onContextMenu}
                  isExpanded={expandedStackIds?.has(stack.id)}
                  onToggleExpand={onToggleExpand}
                  isSelected={stack.pages.some((p) => selectedPageIds.has(p.id))}
                  onClick={handleCardClick}
                />
                {expandedStackIds?.has(stack.id) && stack.pages.length > 0 && onReorderPage && onInsertStackIntoExpanded && onMovePageBetweenStacks && (
                  <PageExpansionBox
                    stackId={stack.id}
                    pages={stack.pages}
                    onReorderPage={onReorderPage}
                    onInsertStackIntoExpanded={onInsertStackIntoExpanded}
                    onMovePageBetweenStacks={onMovePageBetweenStacks}
                    onPageContextMenu={onPageContextMenu}
                    selectedPageIds={selectedPageIds}
                    onPageClick={onPageClick}
                    thumbnailVersions={thumbnailVersions}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {stacks.map((stack, i) => {
              const isExpanded = expandedStackIds?.has(stack.id);
              return (
                <Fragment key={stack.id}>
                  <div
                    data-doc-item
                    className="relative"
                    style={getItemStyle(i)}
                    ref={(el) => {
                      if (el) gridCardRefs.current.set(stack.id, el);
                      else gridCardRefs.current.delete(stack.id);
                    }}
                  >
                    {!isSameContainerDrag && dropIndex === i && <DropIndicatorVertical />}
                    <StackCard
                      stack={stack}
                      index={i}
                      layout="grid"
                      onRemove={onRemoveStack}
                      onDragStart={handleItemDragStart}
                      onDragEnd={handleItemDragEnd}
                      isDragging={dragIndex === i}
                      onContextMenu={onContextMenu}
                      isExpanded={isExpanded}
                      onToggleExpand={onToggleExpand}
                      isSelected={stack.pages.some((p) => selectedPageIds.has(p.id))}
                      onClick={handleCardClick}
                    />
                  </div>
                  {isExpanded && stack.pages.length > 0 && onReorderPage && onInsertStackIntoExpanded && onMovePageBetweenStacks && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <PageExpansionBox
                        stackId={stack.id}
                        pages={stack.pages}
                        onReorderPage={onReorderPage}
                        onInsertStackIntoExpanded={onInsertStackIntoExpanded}
                        onMovePageBetweenStacks={onMovePageBetweenStacks}
                        onPageContextMenu={onPageContextMenu}
                        variant="grid"
                        parentCardElement={gridCardRefs.current.get(stack.id)}
                        selectedPageIds={selectedPageIds}
                        onPageClick={onPageClick}
                        thumbnailVersions={thumbnailVersions}
                      />
                    </div>
                  )}
                </Fragment>
              );
            })}
            {!isSameContainerDrag && dropIndex === stacks.length && stacks.length > 0 && (
              <div className="relative">
                <DropIndicatorVertical />
              </div>
            )}
          </div>
        )}
        {!isSameContainerDrag && viewMode === "list" && dropIndex === stacks.length && stacks.length > 0 && (
          <DropIndicator />
        )}
      </div>

      {dragIndex !== null && stacks[dragIndex] && (
        <StackDragOverlay
          stack={stacks[dragIndex]}
          overlayElRef={overlayElRef}
          layout={viewMode}
          initialPos={overlayOriginPos}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={onCloseContextMenu}
          items={contextMenu.pageIndex !== undefined
            ? buildPageContextMenuItems(
                stacks.find((s) => s.id === contextMenu.stackId),
                contextMenu.pageIndex,
                onExtractPageImages,
                tItem,
              )
            : buildStackContextMenuItems(
                stacks.find((s) => s.id === contextMenu.stackId),
                contextMenu.stackId,
                onSplitStack,
                onExtractStackImages,
                tItem,
              )}
        />
      )}
    </aside>
  );
}

