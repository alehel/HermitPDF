"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { PageStack } from "@/lib/types";
import { StackCard } from "./StackCard";
import { PageExpansionBox } from "./PageExpansionBox";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { UploadIcon, SplitIcon, DownloadIcon, ImageIcon } from "./Icons";
import { DropZone } from "./DropZone";
import { Button } from "@/components/ui/button";
import { ExportModal } from "./ExportModal";
import { PanelHeader } from "./PanelHeader";
import { DropIndicator, DropIndicatorVertical } from "./DropIndicators";
import { StackDragOverlay } from "./StackDragOverlay";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { Fragment, useCallback, useRef, useState } from "react";
import { usePanelDragDrop } from "@/hooks/usePanelDragDrop";

interface StackPanelProps {
  stacks: PageStack[];
  onFilesAdded: (files: FileList, insertAtIndex?: number) => Promise<void>;
  onRemoveStack: (id: string) => void;
  onClearAll: () => void;
  onReorderStack: (fromIndex: number, toIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, stackId: string) => void;
  onPageContextMenu: (e: React.MouseEvent, stackId: string, pageIndex: number) => void;
  onSplitStack: (id: string) => void;
  contextMenu: { x: number; y: number; stackId: string; pageIndex?: number } | null;
  onCloseContextMenu: () => void;
  style?: React.CSSProperties;
  viewMode: "list" | "grid";
  previewVisible?: boolean;
  onTogglePreview?: () => void;
  expandedStackIds?: Set<string>;
  onToggleExpand?: (stackId: string) => void;
  onReorderPage?: (stackId: string, fromPageIndex: number, toPageIndex: number) => void;
  onExtractPageToList?: (sourceStackId: string, pageIndex: number, insertAtStackIndex: number) => void;
  onInsertStackIntoExpanded?: (targetStackId: string, sourceStackIndex: number, insertAtPageIndex: number) => void;
  onMovePageBetweenStacks?: (sourceStackId: string, sourcePageIndex: number, targetStackId: string, insertAtPageIndex: number) => void;
  focusedStackId?: string | null;
  focusedPageId?: string | null;
  focusLevel?: "stack" | "page";
  onScrollToPage?: (pageId: string) => void;
  onStackSelect?: (stackId: string) => void;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  rotateDisabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  thumbnailVersions?: Map<string, number>;
  onExtractAllImages?: () => void;
  onExtractFocusedPage?: () => void;
  onExtractPageImages?: (stackId: string, pageIndex: number) => void;
  onExtractStackImages?: (stackId: string) => void;
  extractAllDisabled?: boolean;
  extractPageDisabled?: boolean;
  isExtracting?: boolean;
  onRemoveSelected?: () => void;
  removeSelectedDisabled?: boolean;
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

async function exportFocusedPageAsPdf(
  stack: PageStack,
  focusedPageId: string
): Promise<void> {
  const page = stack.pages.find((p) => p.id === focusedPageId);
  if (!page) return;
  const bytes = await exportMergedPdf([{ ...stack, pages: [page] }]);
  downloadPdf(bytes, `${stack.name}-page.pdf`);
}

async function exportStackAsPdf(stack: PageStack): Promise<void> {
  const bytes = await exportMergedPdf([stack]);
  downloadPdf(bytes, stack.name);
}

export function StackPanel({
  stacks,
  onFilesAdded,
  onRemoveStack,
  onClearAll,
  onReorderStack,
  onContextMenu,
  onPageContextMenu,
  onSplitStack,
  contextMenu,
  onCloseContextMenu,
  style,
  viewMode,
  previewVisible,
  onTogglePreview,
  expandedStackIds,
  onToggleExpand,
  onReorderPage,
  onExtractPageToList,
  onInsertStackIntoExpanded,
  onMovePageBetweenStacks,
  focusedStackId,
  focusedPageId,
  focusLevel,
  onScrollToPage,
  onStackSelect,
  onRotateLeft,
  onRotateRight,
  rotateDisabled,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  thumbnailVersions,
  onExtractAllImages,
  onExtractFocusedPage,
  onExtractPageImages,
  onExtractStackImages,
  extractAllDisabled,
  extractPageDisabled,
  isExtracting,
  onRemoveSelected,
  removeSelectedDisabled,
}: StackPanelProps) {
  const tItem = useTranslations("documentItem");
  const t = useTranslations("documentPanel");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExportSelection = useCallback(async () => {
    if (!focusedStackId) return;
    const stack = stacks.find((s) => s.id === focusedStackId);
    if (!stack) return;

    if (focusedPageId && focusLevel === "page") {
      await exportFocusedPageAsPdf(stack, focusedPageId);
    } else {
      await exportStackAsPdf(stack);
    }
  }, [stacks, focusedStackId, focusedPageId, focusLevel]);

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

  const handleCardClick = onStackSelect
    || (onScrollToPage
      ? (stackId: string) => onScrollToPage(stacks.find(s => s.id === stackId)!.pages[0].id)
      : undefined);

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesAdded(e.target.files);
        e.target.value = "";
      }
    },
    [onFilesAdded]
  );

  return (
    <aside suppressHydrationWarning style={style} className={clsx("flex min-w-0 flex-col bg-background", previewVisible !== false && "border-r border-border")}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-label={t("addFiles")}
      />

      <PanelHeader onAddFiles={handleBrowse} onClearAll={onClearAll} clearAllDisabled={stacks.length === 0} previewVisible={previewVisible} onTogglePreview={onTogglePreview} onRotateLeft={onRotateLeft} onRotateRight={onRotateRight} rotateDisabled={rotateDisabled} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} onExtractAllImages={onExtractAllImages} onExtractFocusedPage={onExtractFocusedPage} extractAllDisabled={extractAllDisabled} extractPageDisabled={extractPageDisabled} isExtracting={isExtracting} onRemoveSelected={onRemoveSelected} removeSelectedDisabled={removeSelectedDisabled} onExportAll={() => setShowExportModal(true)} onExportSelection={handleExportSelection} exportAllDisabled={stacks.length === 0} exportSelectionDisabled={!focusedStackId} />

      <div
        ref={listRef}
        className={clsx(
          "flex-1 overflow-y-auto p-4 transition-colors",
          dropIndex !== null && !isSameContainerDrag && "bg-accent/40"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {stacks.length === 0 ? (
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={handleBrowse}
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
                  isFocused={focusedStackId === stack.id}
                  focusLevel={focusLevel}
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
                    focusedPageId={focusedPageId}
                    focusLevel={focusedStackId === stack.id ? focusLevel : undefined}
                    onScrollToPage={onScrollToPage}
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
                      isFocused={focusedStackId === stack.id}
                      focusLevel={focusLevel}
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
                        focusedPageId={focusedPageId}
                        focusLevel={focusedStackId === stack.id ? focusLevel : undefined}
                        onScrollToPage={onScrollToPage}
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

      {showExportModal && (
        <ExportModal
          stacks={stacks}
          onClose={() => setShowExportModal(false)}
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

