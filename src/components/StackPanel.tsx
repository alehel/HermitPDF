"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type Active,
  type Over,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { PageStack } from "@/lib/types";
import { StackCard } from "./StackCard";
import { PageExpansionBox } from "./PageExpansionBox";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { SplitIcon, DownloadIcon, ImageIcon } from "./Icons";
import { DropZone } from "./DropZone";
import { StackDragPreview, PageDragPreview } from "./DragPreviews";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";

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

interface StackSortableData {
  type: "stack";
  stackId: string;
  index: number;
}

interface PageSortableData {
  type: "page";
  stackId: string;
  pageIndex: number;
  pageId: string;
}

type SortableData = StackSortableData | PageSortableData;

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

function getSortableData(node: Active | Over | null | undefined): SortableData | null {
  const data = node?.data.current;
  if (!data) return null;
  if (data.type === "stack" || data.type === "page") return data as SortableData;
  return null;
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
  const gridCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [activeDrag, setActiveDrag] = useState<SortableData | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDrag(getSortableData(e.active));
  }, []);

  const handleDragCancel = useCallback(() => setActiveDrag(null), []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDrag(null);
    const active = getSortableData(e.active);
    const over = getSortableData(e.over);
    if (!active || !over) return;
    if (e.active.id === e.over?.id) return;

    // Stack → Stack: reorder stacks
    if (active.type === "stack" && over.type === "stack") {
      const oldIndex = active.index;
      const newIndex = over.index;
      if (oldIndex === newIndex) return;
      const slotIndex = newIndex > oldIndex ? newIndex + 1 : newIndex;
      onReorderStack(oldIndex, slotIndex);
      return;
    }

    // Page → Page
    if (active.type === "page" && over.type === "page") {
      if (active.stackId === over.stackId) {
        // Same stack — reorder
        const oldIndex = active.pageIndex;
        const newIndex = over.pageIndex;
        if (oldIndex === newIndex) return;
        const slotIndex = newIndex > oldIndex ? newIndex + 1 : newIndex;
        onReorderPage?.(active.stackId, oldIndex, slotIndex);
      } else {
        // Cross-stack page move
        onMovePageBetweenStacks?.(
          active.stackId,
          active.pageIndex,
          over.stackId,
          over.pageIndex
        );
      }
      return;
    }

    // Stack → Page: insert source stack's pages into target's expanded stack
    if (active.type === "stack" && over.type === "page") {
      onInsertStackIntoExpanded?.(over.stackId, active.index, over.pageIndex);
      return;
    }

    // Page → Stack: extract page as new stack at target's position
    if (active.type === "page" && over.type === "stack") {
      onExtractPageToList?.(active.stackId, active.pageIndex, over.index);
      return;
    }
  }, [
    onReorderStack,
    onReorderPage,
    onMovePageBetweenStacks,
    onInsertStackIntoExpanded,
    onExtractPageToList,
  ]);

  // Native OS file drops — dnd-kit doesn't handle these
  const handleNativeDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setFileDragOver(true);
  }, []);

  const handleNativeDragLeave = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    if (target && !target.contains(e.relatedTarget as Node)) {
      setFileDragOver(false);
    }
  }, []);

  const handleNativeDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setFileDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onFilesAdded(e.dataTransfer.files);
    }
  }, [onFilesAdded]);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-doc-item], [data-expansion-box]")) {
      onDeselect?.();
    }
  }, [onDeselect]);

  const activeStack = activeDrag?.type === "stack"
    ? stacks.find((s) => s.id === activeDrag.stackId)
    : null;
  const activePage = activeDrag?.type === "page"
    ? stacks.find((s) => s.id === activeDrag.stackId)?.pages[activeDrag.pageIndex]
    : null;

  return (
    <aside
      suppressHydrationWarning
      style={style}
      className={clsx(
        "flex min-w-0 flex-col bg-background",
        previewVisible !== false && "border-r border-border",
      )}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className={clsx(
            "flex-1 overflow-y-auto p-4 transition-colors",
            fileDragOver && "bg-accent/40",
          )}
          onDragOver={handleNativeDragOver}
          onDragLeave={handleNativeDragLeave}
          onDrop={handleNativeDrop}
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
          ) : (
            <SortableContext
              items={stacks.map((s) => s.id)}
              strategy={viewMode === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
            >
              {viewMode === "list" ? (
                <ul>
                  {stacks.map((stack, i) => (
                    <li key={stack.id} data-doc-item className="list-none">
                      <StackCard
                        stack={stack}
                        index={i}
                        layout="list"
                        onRemove={onRemoveStack}
                        onContextMenu={onContextMenu}
                        isExpanded={expandedStackIds?.has(stack.id)}
                        onToggleExpand={onToggleExpand}
                        isSelected={stack.pages.some((p) => selectedPageIds.has(p.id))}
                        onClick={onStackClick}
                      />
                      {expandedStackIds?.has(stack.id) && stack.pages.length > 0 && (
                        <PageExpansionBox
                          stackId={stack.id}
                          pages={stack.pages}
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
                          ref={(el) => {
                            if (el) gridCardRefs.current.set(stack.id, el);
                            else gridCardRefs.current.delete(stack.id);
                          }}
                        >
                          <StackCard
                            stack={stack}
                            index={i}
                            layout="grid"
                            onRemove={onRemoveStack}
                            onContextMenu={onContextMenu}
                            isExpanded={isExpanded}
                            onToggleExpand={onToggleExpand}
                            isSelected={stack.pages.some((p) => selectedPageIds.has(p.id))}
                            onClick={onStackClick}
                          />
                        </div>
                        {isExpanded && stack.pages.length > 0 && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <PageExpansionBox
                              stackId={stack.id}
                              pages={stack.pages}
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
                </div>
              )}
            </SortableContext>
          )}
        </div>

        <DragOverlay>
          {activeStack ? (
            <StackDragPreview stack={activeStack} layout={viewMode} />
          ) : activePage && activeDrag?.type === "page" ? (
            <PageDragPreview
              pageRef={activePage}
              pageIndex={activeDrag.pageIndex}
              layout={
                stacks.find((s) => s.id === activeDrag.stackId) &&
                expandedStackIds?.has(activeDrag.stackId) &&
                viewMode === "grid"
                  ? "tile"
                  : "row"
              }
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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
