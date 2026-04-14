"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { useTranslations } from "next-intl";
import { DismissibleBanner } from "@/components/DismissibleBanner";
import { StackPanel } from "@/components/StackPanel";
import { Workspace } from "@/components/Workspace";
import { ResizeDivider } from "@/components/ResizeDivider";
import { TabBar } from "@/components/TabBar";
import { PageStack } from "@/lib/types";
import { releaseDoc } from "@/lib/pdfStore";
import { releaseDocument } from "@/lib/mupdfClient";
import { ingestDocument } from "@/lib/pdfIngest";
import { clearThumbnail } from "@/lib/thumbnailCache";
import { normalizeRotation } from "@/lib/rotationUtils";
import {
  reorderPageInStack,
  extractPageFromStack,
  insertPagesIntoStack,
  movePageBetweenStacks,
} from "@/lib/pdfPageOps";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useHistory, HistorySnapshot } from "@/hooks/useHistory";
import { useUndoRedoShortcuts } from "@/hooks/useUndoRedoShortcuts";
import { useImageExtraction } from "@/hooks/useImageExtraction";

const GRID_THRESHOLD = 500;

/** Compare rotation values between two stacks snapshots, clearing thumbnails for changed pages. */
function reconcileThumbnails(prev: PageStack[], next: PageStack[]): string[] {
  const changed: string[] = [];
  const prevRotations = new Map<string, number>();
  for (const stack of prev) {
    for (const page of stack.pages) {
      prevRotations.set(page.id, page.rotation);
    }
  }
  for (const stack of next) {
    for (const page of stack.pages) {
      const oldRot = prevRotations.get(page.id);
      if (oldRot !== undefined && oldRot !== page.rotation) {
        clearThumbnail(page.id);
        changed.push(page.id);
      }
    }
  }
  return changed;
}

export function StackManager() {
  const t = useTranslations("documentPanel");
  // --- Refs for history eviction callback (set after useHistory call) ---
  const allDocIdsRef = useRef<() => Set<string>>(() => new Set());
  const allPageIdsRef = useRef<() => Set<string>>(() => new Set());

  const handleHistoryEvict = useCallback((evicted: HistorySnapshot) => {
    const allDocIds = allDocIdsRef.current();
    const allPageIds = allPageIdsRef.current();
    for (const stack of evicted.stacks) {
      for (const page of stack.pages) {
        if (!allDocIds.has(page.sourceDocId)) {
          releaseDocument(page.sourceDocId);
          releaseDoc(page.sourceDocId);
        }
        if (!allPageIds.has(page.id)) {
          clearThumbnail(page.id);
        }
      }
    }
  }, []);

  const {
    current: snapshot,
    commit,
    undo,
    redo,
    replace,
    canUndo,
    canRedo,
    allReferencedDocIds,
    allReferencedPageIds,
  } = useHistory(handleHistoryEvict);

  const { stacks, expandedStackIds } = snapshot;

  allDocIdsRef.current = allReferencedDocIds;
  allPageIdsRef.current = allReferencedPageIds;

  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;
  const expandedRef = useRef(expandedStackIds);
  expandedRef.current = expandedStackIds;

  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    stackId: string;
    pageIndex?: number;
  } | null>(null);
  const [focusedPageId, setFocusedPageId] = useState<string | null>(null);
  const [scrollToPageId, setScrollToPageId] = useState<string | null>(null);
  const [thumbnailVersions, setThumbnailVersions] = useState<Map<string, number>>(new Map());
  const [focusLevel, setFocusLevel] = useState<"stack" | "page">("page");
  const [activeTab, setActiveTab] = useState<"documents" | "preview">("documents");

  // Warn before navigating away when documents are loaded
  const hasStacks = stacks.length > 0;
  useEffect(() => {
    if (!hasStacks) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasStacks]);

  const focusedStackId = useMemo(() => {
    if (!focusedPageId) return null;
    return stacks.find((s) => s.pages.some((p) => p.id === focusedPageId))?.id ?? null;
  }, [stacks, focusedPageId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    previewWidth,
    handleMouseDown,
    isResizing,
    previewVisible,
    togglePreview,
    isNarrow,
    containerWidth,
  } = useResizablePanel(containerRef);

  const {
    isExtracting,
    noImagesFound,
    clearNoImagesFound,
    handleExtractPageImages,
    handleExtractStackImages,
    handleExtractAllImages,
    handleExtractFocusedPage,
  } = useImageExtraction({ stacksRef, focusedPageId });

  const showSideBySide = !isNarrow && previewVisible;
  const stackPanelWidth = showSideBySide && previewWidth > 0
    ? containerWidth - previewWidth - 6
    : containerWidth;
  const viewMode: "grid" | "list" = stackPanelWidth >= GRID_THRESHOLD ? "grid" : "list";

  // --- Undo / Redo ---

  /**
   * After restoring a history snapshot (undo or redo), reconcile thumbnail
   * caches for pages whose rotation changed and clear the focused page
   * if it no longer exists in the restored state.
   */
  const applyRestoredSnapshot = useCallback(
    (prevStacks: PageStack[], restored: HistorySnapshot | null) => {
      if (!restored) return;

      const changed = reconcileThumbnails(prevStacks, restored.stacks);
      if (changed.length > 0) {
        setThumbnailVersions((m) => {
          const next = new Map(m);
          for (const id of changed) next.set(id, (m.get(id) ?? 0) + 1);
          return next;
        });
      }

      const pageIds = new Set(restored.stacks.flatMap((s) => s.pages.map((p) => p.id)));
      setFocusedPageId((prev) => (prev && pageIds.has(prev) ? prev : null));
    },
    []
  );

  const handleUndo = useCallback(() => {
    applyRestoredSnapshot(stacksRef.current, undo());
  }, [undo, applyRestoredSnapshot]);

  const handleRedo = useCallback(() => {
    applyRestoredSnapshot(stacksRef.current, redo());
  }, [redo, applyRestoredSnapshot]);

  useUndoRedoShortcuts(handleUndo, handleRedo);

  // --- Document operations ---

  const handleFilesAdded = useCallback(
    async (files: FileList, insertAtIndex?: number) => {
      const allFiles = Array.from(files);
      const pdfFiles = allFiles.filter((f) => f.type === "application/pdf");
      const rejected = allFiles
        .filter((f) => f.type !== "application/pdf")
        .map((f) => f.name);

      const passwordProtected: string[] = [];
      const results = await Promise.all(
        pdfFiles.map(async (f) => {
          try {
            const data = await f.arrayBuffer();
            return await ingestDocument(data, f.name, f.size);
          } catch (err: unknown) {
            const msg =
              err instanceof Error ? err.message.toLowerCase() : "";
            if (msg.includes("password") || msg.includes("encrypted")) {
              passwordProtected.push(f.name);
              return null;
            }
            rejected.push(f.name);
            return null;
          }
        })
      );

      if (rejected.length > 0) setRejectedFiles(rejected);
      if (passwordProtected.length > 0) setPasswordProtectedFiles(passwordProtected);

      const newStacks = results.filter((s): s is PageStack => s !== null);
      if (newStacks.length === 0) return;

      const prev = stacksRef.current;
      let nextStacks: PageStack[];
      if (insertAtIndex !== undefined && insertAtIndex < prev.length) {
        nextStacks = [...prev];
        nextStacks.splice(insertAtIndex, 0, ...newStacks);
      } else {
        nextStacks = [...prev, ...newStacks];
      }
      commit({ stacks: nextStacks, expandedStackIds: expandedRef.current });
    },
    [commit]
  );

  const handleRemoveStack = useCallback((id: string) => {
    const stack = stacksRef.current.find((s) => s.id === id);
    if (!stack) return;

    const remaining = stacksRef.current.filter((s) => s.id !== id);
    const nextExpanded = new Set(expandedRef.current);
    nextExpanded.delete(id);

    commit({ stacks: remaining, expandedStackIds: nextExpanded });
  }, [commit]);

  const handleClearAll = useCallback(() => {
    if (stacksRef.current.length === 0) return;
    commit({ stacks: [], expandedStackIds: new Set() });
  }, [commit]);

  const handleRemoveSelected = useCallback(() => {
    if (!focusedStackId) return;
    handleRemoveStack(focusedStackId);
  }, [focusedStackId, handleRemoveStack]);

  const handleContextMenu = useCallback((e: React.MouseEvent, stackId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, stackId });
  }, []);

  const handlePageContextMenu = useCallback((e: React.MouseEvent, stackId: string, pageIndex: number) => {
    setContextMenu({ x: e.clientX, y: e.clientY, stackId, pageIndex });
  }, []);

  // Split a stack into individual single-page stacks
  const handleSplitStack = useCallback((id: string) => {
    const stack = stacksRef.current.find((s) => s.id === id);
    if (!stack || stack.pages.length <= 1) return;

    const baseName = stack.name.replace(/\.pdf$/i, "");
    const singlePageStacks: PageStack[] = stack.pages.map((pageRef, i) => ({
      id: crypto.randomUUID(),
      pages: [pageRef],
      name: `${baseName} — Page ${i + 1}.pdf`,
      size: 0,
    }));

    const nextStacks = [...stacksRef.current];
    const index = nextStacks.findIndex((s) => s.id === id);
    if (index === -1) return;
    nextStacks.splice(index, 1, ...singlePageStacks);

    const nextExpanded = new Set(expandedRef.current);
    nextExpanded.delete(id);

    commit({ stacks: nextStacks, expandedStackIds: nextExpanded });
  }, [commit]);

  const handleScrollToPage = useCallback((pageId: string) => {
    setFocusLevel("page");
    setFocusedPageId(pageId);
    setScrollToPageId(pageId);
    if (isNarrow) setActiveTab("preview");
  }, [isNarrow]);

  const handleStackSelect = useCallback((stackId: string) => {
    const stack = stacksRef.current.find((s) => s.id === stackId);
    if (!stack || stack.pages.length === 0) return;
    setFocusLevel("stack");
    setFocusedPageId(stack.pages[0].id);
    setScrollToPageId(stack.pages[0].id);
    if (isNarrow) setActiveTab("preview");
  }, [isNarrow]);

  const handleReorderStack = useCallback((fromIndex: number, toIndex: number) => {
    const copy = [...stacksRef.current];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
    commit({ stacks: copy, expandedStackIds: expandedRef.current });
  }, [commit]);

  const handleToggleExpand = useCallback((stackId: string) => {
    const next = new Set(expandedRef.current);
    if (next.has(stackId)) {
      next.delete(stackId);
    } else {
      next.add(stackId);
    }
    replace({ stacks: stacksRef.current, expandedStackIds: next });
  }, [replace]);

  const handleReorderPage = useCallback((
    stackId: string,
    fromPageIndex: number,
    toPageIndex: number
  ) => {
    const nextStacks = stacksRef.current.map((s) =>
      s.id === stackId ? reorderPageInStack(s, fromPageIndex, toPageIndex) : s
    );
    commit({ stacks: nextStacks, expandedStackIds: expandedRef.current });
  }, [commit]);

  const handleExtractPageToList = useCallback((
    sourceStackId: string,
    pageIndex: number,
    insertAtStackIndex: number
  ) => {
    const stack = stacksRef.current.find((s) => s.id === sourceStackId);
    if (!stack) return;

    const { extracted, remainder } = extractPageFromStack(stack, pageIndex);

    const copy = [...stacksRef.current];
    const sourceIdx = copy.findIndex((s) => s.id === sourceStackId);
    if (sourceIdx === -1) return;

    if (remainder) {
      copy[sourceIdx] = remainder;
    } else {
      copy.splice(sourceIdx, 1);
    }

    let adjustedInsert = insertAtStackIndex;
    if (!remainder && sourceIdx < insertAtStackIndex) {
      adjustedInsert--;
    }
    copy.splice(adjustedInsert, 0, extracted);

    const nextExpanded = new Set(expandedRef.current);
    if (!remainder) nextExpanded.delete(sourceStackId);

    commit({ stacks: copy, expandedStackIds: nextExpanded });
  }, [commit]);

  const handleInsertStackIntoExpanded = useCallback((
    targetStackId: string,
    sourceStackIndex: number,
    insertAtPageIndex: number
  ) => {
    const source = stacksRef.current[sourceStackIndex];
    const target = stacksRef.current.find((s) => s.id === targetStackId);
    if (!target || !source || targetStackId === source.id) return;

    const updated = insertPagesIntoStack(target, source.pages, insertAtPageIndex);

    const nextStacks = stacksRef.current
      .map((s) => (s.id === targetStackId ? updated : s))
      .filter((s) => s.id !== source.id);

    const nextExpanded = new Set(expandedRef.current);
    nextExpanded.delete(source.id);

    commit({ stacks: nextStacks, expandedStackIds: nextExpanded });
  }, [commit]);

  const handleRotatePage = useCallback((pageRefId: string, degrees: number) => {
    const nextStacks = stacksRef.current.map((stack) => ({
      ...stack,
      pages: stack.pages.map((p) =>
        p.id === pageRefId
          ? { ...p, rotation: normalizeRotation(p.rotation, degrees) }
          : p
      ),
    }));
    commit({ stacks: nextStacks, expandedStackIds: expandedRef.current });
    clearThumbnail(pageRefId);
    setThumbnailVersions((prev) => {
      const next = new Map(prev);
      next.set(pageRefId, (prev.get(pageRefId) ?? 0) + 1);
      return next;
    });
  }, [commit]);

  const handleRotate = useCallback((degrees: number) => {
    let pageIds: string[];
    if (focusLevel === "stack" && focusedStackId) {
      const stack = stacksRef.current.find((s) => s.id === focusedStackId);
      if (!stack) return;
      pageIds = stack.pages.map((p) => p.id);
    } else if (focusedPageId) {
      pageIds = [focusedPageId];
    } else {
      return;
    }
    if (pageIds.length === 0) return;

    // Single page — delegate
    if (pageIds.length === 1) {
      handleRotatePage(pageIds[0], degrees);
      return;
    }

    // Multiple pages (whole stack) — single commit
    const idsSet = new Set(pageIds);
    const nextStacks = stacksRef.current.map((stack) => ({
      ...stack,
      pages: stack.pages.map((p) =>
        idsSet.has(p.id)
          ? { ...p, rotation: normalizeRotation(p.rotation, degrees) }
          : p
      ),
    }));
    commit({ stacks: nextStacks, expandedStackIds: expandedRef.current });
    for (const id of pageIds) clearThumbnail(id);
    setThumbnailVersions((prev) => {
      const next = new Map(prev);
      for (const id of pageIds) next.set(id, (prev.get(id) ?? 0) + 1);
      return next;
    });
  }, [focusLevel, focusedStackId, focusedPageId, handleRotatePage, commit]);

  const handleMovePageBetweenStacks = useCallback((
    sourceStackId: string,
    sourcePageIndex: number,
    targetStackId: string,
    insertAtPageIndex: number
  ) => {
    const source = stacksRef.current.find((s) => s.id === sourceStackId);
    const target = stacksRef.current.find((s) => s.id === targetStackId);
    if (!source || !target) return;

    const { updatedSource, updatedTarget } = movePageBetweenStacks(
      source,
      sourcePageIndex,
      target,
      insertAtPageIndex
    );

    let nextStacks = stacksRef.current.map((s) => {
      if (s.id === targetStackId) return updatedTarget;
      if (s.id === sourceStackId) return updatedSource ?? s;
      return s;
    });
    if (!updatedSource) {
      nextStacks = nextStacks.filter((s) => s.id !== sourceStackId);
    }

    const nextExpanded = new Set(expandedRef.current);
    if (!updatedSource) nextExpanded.delete(sourceStackId);

    commit({ stacks: nextStacks, expandedStackIds: nextExpanded });
  }, [commit]);

  // --- Shared StackPanel props (avoids duplicating ~25 props for narrow vs. wide) ---

  const sharedStackPanelProps = useMemo(() => ({
    stacks,
    onFilesAdded: handleFilesAdded,
    onRemoveStack: handleRemoveStack,
    onClearAll: handleClearAll,
    onReorderStack: handleReorderStack,
    onContextMenu: handleContextMenu,
    onPageContextMenu: handlePageContextMenu,
    onSplitStack: handleSplitStack,
    contextMenu,
    onCloseContextMenu: () => setContextMenu(null),
    viewMode,
    expandedStackIds,
    onToggleExpand: handleToggleExpand,
    onReorderPage: handleReorderPage,
    onExtractPageToList: handleExtractPageToList,
    onInsertStackIntoExpanded: handleInsertStackIntoExpanded,
    onMovePageBetweenStacks: handleMovePageBetweenStacks,
    focusedStackId,
    focusedPageId,
    focusLevel,
    onScrollToPage: handleScrollToPage,
    onStackSelect: handleStackSelect,
    onRotateLeft: () => handleRotate(-90),
    onRotateRight: () => handleRotate(90),
    rotateDisabled: !focusedPageId,
    thumbnailVersions,
    onExtractAllImages: handleExtractAllImages,
    onExtractFocusedPage: handleExtractFocusedPage,
    onExtractPageImages: handleExtractPageImages,
    onExtractStackImages: handleExtractStackImages,
    extractAllDisabled: stacks.length === 0,
    extractPageDisabled: !focusedPageId,
    isExtracting,
    onRemoveSelected: handleRemoveSelected,
    removeSelectedDisabled: !focusedStackId,
  }), [
    stacks, handleFilesAdded, handleRemoveStack, handleClearAll,
    handleReorderStack, handleContextMenu, handlePageContextMenu,
    handleSplitStack, contextMenu, viewMode, expandedStackIds,
    handleToggleExpand, handleReorderPage, handleExtractPageToList,
    handleInsertStackIntoExpanded, handleMovePageBetweenStacks,
    focusedStackId, focusedPageId, focusLevel, handleScrollToPage,
    handleStackSelect, handleRotate, thumbnailVersions,
    handleExtractAllImages, handleExtractFocusedPage,
    handleExtractPageImages, handleExtractStackImages, isExtracting,
    handleRemoveSelected,
  ]);

  return (
    <div className="flex h-full flex-col" data-workbench>
      <Topbar />
      {rejectedFiles.length > 0 && (
        <DismissibleBanner
          message={t("rejectedFiles", { files: rejectedFiles.join(", ") })}
          dismissLabel={t("dismiss")}
          onDismiss={() => setRejectedFiles([])}
        />
      )}
      {passwordProtectedFiles.length > 0 && (
        <DismissibleBanner
          message={t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") })}
          dismissLabel={t("dismiss")}
          onDismiss={() => setPasswordProtectedFiles([])}
        />
      )}
      {noImagesFound && (
        <DismissibleBanner
          message={t("noImagesFound")}
          dismissLabel={t("dismiss")}
          onDismiss={clearNoImagesFound}
        />
      )}
      {isNarrow && (
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {isNarrow ? (
          activeTab === "documents" ? (
            <StackPanel
              {...sharedStackPanelProps}
              style={{ flex: 1 }}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          ) : (
            <Workspace
              stacks={stacks}
              scrollToPageId={scrollToPageId}
              onScrollComplete={() => setScrollToPageId(null)}
              onFocusedPageChange={setFocusedPageId}
              thumbnailVersions={thumbnailVersions}
            />
          )
        ) : (
          <>
            <StackPanel
              {...sharedStackPanelProps}
              style={{ flex: 1, minWidth: 0 }}
              previewVisible={previewVisible}
              onTogglePreview={togglePreview}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
            />
            {previewVisible && (
              <>
                <ResizeDivider onMouseDown={handleMouseDown} />
                <Workspace
                  stacks={stacks}
                  isResizing={isResizing}
                  style={previewWidth > 0 ? { width: previewWidth, flex: "none" } : { flex: "0.4 1 0%" }}
                  scrollToPageId={scrollToPageId}
                  onScrollComplete={() => setScrollToPageId(null)}
                  onFocusedPageChange={setFocusedPageId}
                  thumbnailVersions={thumbnailVersions}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
