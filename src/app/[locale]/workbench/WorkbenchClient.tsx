"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DismissibleBanner } from "@/components/DismissibleBanner";
import { StackPanel } from "@/components/StackPanel";
import { Workspace } from "@/components/Workspace";
import { ResizeDivider } from "@/components/ResizeDivider";
import { TabBar } from "@/components/TabBar";
import { PanelHeader } from "@/components/PanelHeader";
import { PropertiesModal } from "@/components/PropertiesModal";
import { PageStack } from "@/lib/types";
import { releaseDoc } from "@/lib/pdfStore";
import { releaseDocument } from "@/lib/mupdfClient";
import { ingestDocument, MAX_INGEST_BYTES } from "@/lib/pdfIngest";
import { clearThumbnail } from "@/lib/thumbnailCache";
import { normalizeRotation } from "@/lib/rotationUtils";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { loadSavedMetadata } from "@/lib/pdfMetadata";
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

export function WorkbenchClient() {
  const t = useTranslations("documentPanel");
  // --- Refs for history eviction callback (set after useHistory call) ---
  const allDocIdsRef = useRef<() => Set<string>>(() => new Set());
  const allPageIdsRef = useRef<() => Set<string>>(() => new Set());

  const handleHistoryEvict = useCallback((evicted: HistorySnapshot) => {
    const allDocIds = allDocIdsRef.current();
    const allPageIds = allPageIdsRef.current();
    const releasedDocIds = new Set<string>();
    for (const stack of evicted.stacks) {
      for (const page of stack.pages) {
        if (
          !allDocIds.has(page.sourceDocId) &&
          !releasedDocIds.has(page.sourceDocId)
        ) {
          releasedDocIds.add(page.sourceDocId);
          void releaseDocument(page.sourceDocId);
          void releaseDoc(page.sourceDocId);
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
  const [oversizedFiles, setOversizedFiles] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    stackId: string;
    pageIndex?: number;
  } | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [anchorPageId, setAnchorPageId] = useState<string | null>(null);
  const [scrollToPageId, setScrollToPageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "preview">("documents");
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [metadataSaveFailed, setMetadataSaveFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Release all docs and thumbnails on unmount (e.g., navigating to a different
  // tool route). Without this, every doc opened in the workbench leaks for the
  // rest of the session — React state is destroyed on unmount, but pdfStore and
  // mupdfClient's handle map are module-level and survive.
  useEffect(() => {
    return () => {
      const docIds = allDocIdsRef.current();
      const pageIds = allPageIdsRef.current();
      for (const docId of docIds) {
        void releaseDocument(docId);
        void releaseDoc(docId);
      }
      for (const pageId of pageIds) {
        clearThumbnail(pageId);
      }
    };
  }, []);

  const hasSelection = selectedPageIds.size > 0;

  // Flat ordered list of all page IDs for Shift-click range selection
  const flatPageIds = useMemo(
    () => stacks.flatMap((s) => s.pages.map((p) => p.id)),
    [stacks]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    previewWidth,
    handlePointerDown,
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
    handleExtractSelectedPages,
  } = useImageExtraction({ stacksRef, selectedPageIds });

  const showSideBySide = !isNarrow && previewVisible;
  const stackPanelWidth = showSideBySide && previewWidth > 0
    ? containerWidth - previewWidth - 6
    : containerWidth;
  const viewMode: "grid" | "list" = stackPanelWidth >= GRID_THRESHOLD ? "grid" : "list";

  // --- Undo / Redo ---

  const pruneSelectionAfterRestore = useCallback(
    (restoredStacks: PageStack[]) => {
      const survivingIds = new Set(restoredStacks.flatMap((s) => s.pages.map((p) => p.id)));
      setSelectedPageIds((prev) => {
        const next = new Set([...prev].filter((id) => survivingIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setAnchorPageId((prev) => (prev && survivingIds.has(prev) ? prev : null));
    },
    []
  );

  const applyRestoredSnapshot = useCallback(
    (restored: HistorySnapshot | null) => {
      if (!restored) return;
      pruneSelectionAfterRestore(restored.stacks);
    },
    [pruneSelectionAfterRestore]
  );

  const handleUndo = useCallback(() => {
    applyRestoredSnapshot(undo());
  }, [undo, applyRestoredSnapshot]);

  const handleRedo = useCallback(() => {
    applyRestoredSnapshot(redo());
  }, [redo, applyRestoredSnapshot]);

  useUndoRedoShortcuts(handleUndo, handleRedo);

  // --- Document operations ---

  const ingestDroppedFiles = useCallback(
    async (files: FileList): Promise<{
      newStacks: PageStack[];
      rejected: string[];
      passwordProtected: string[];
      oversized: string[];
    }> => {
      const allFiles = Array.from(files);
      const pdfFiles = allFiles.filter((f) => f.type === "application/pdf");
      const rejected = allFiles
        .filter((f) => f.type !== "application/pdf")
        .map((f) => f.name);
      const oversized = pdfFiles
        .filter((f) => f.size > MAX_INGEST_BYTES)
        .map((f) => f.name);
      const candidates = pdfFiles.filter((f) => f.size <= MAX_INGEST_BYTES);

      const passwordProtected: string[] = [];
      const results = await Promise.all(
        candidates.map(async (f) => {
          try {
            const result = await ingestDocument(f, f.name, f.size);
            return result.stack;
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

      const newStacks = results.filter((s): s is PageStack => s !== null);
      return { newStacks, rejected, passwordProtected, oversized };
    },
    []
  );

  const insertStacks = useCallback(
    (newStacks: PageStack[], insertAtIndex?: number) => {
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

  const handleFilesAdded = useCallback(
    async (files: FileList, insertAtIndex?: number) => {
      const { newStacks, rejected, passwordProtected, oversized } =
        await ingestDroppedFiles(files);

      if (rejected.length > 0) setRejectedFiles(rejected);
      if (passwordProtected.length > 0) setPasswordProtectedFiles(passwordProtected);
      if (oversized.length > 0) setOversizedFiles(oversized);
      if (newStacks.length === 0) return;

      insertStacks(newStacks, insertAtIndex);
    },
    [ingestDroppedFiles, insertStacks]
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
    if (selectedPageIds.size === 0) return;
    const nextStacks = stacksRef.current
      .map((s) => ({ ...s, pages: s.pages.filter((p) => !selectedPageIds.has(p.id)) }))
      .filter((s) => s.pages.length > 0);
    const nextExpanded = new Set([...expandedRef.current].filter(
      (id) => nextStacks.some((s) => s.id === id)
    ));
    commit({ stacks: nextStacks, expandedStackIds: nextExpanded });
    setSelectedPageIds(new Set());
    setAnchorPageId(null);
  }, [selectedPageIds, commit]);

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

  const handlePageClick = useCallback((pageId: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchorPageId) {
      // Range select between anchor and clicked page
      const anchorIdx = flatPageIds.indexOf(anchorPageId);
      const targetIdx = flatPageIds.indexOf(pageId);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const range = flatPageIds.slice(start, end + 1);
        setSelectedPageIds(new Set(range));
      }
      // Shift-click does NOT move anchor
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle individual page
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        if (next.has(pageId)) next.delete(pageId);
        else next.add(pageId);
        return next;
      });
      setAnchorPageId(pageId);
    } else {
      // Plain click — single select
      setSelectedPageIds(new Set([pageId]));
      setAnchorPageId(pageId);
      setScrollToPageId(pageId);
    }
  }, [anchorPageId, flatPageIds]);

  const handleStackClick = useCallback((stackId: string, e: React.MouseEvent) => {
    const stack = stacksRef.current.find((s) => s.id === stackId);
    if (!stack || stack.pages.length === 0) return;
    const stackPageIds = stack.pages.map((p) => p.id);

    if (e.shiftKey && anchorPageId) {
      // Range select stacks between anchor stack and clicked stack
      const anchorStackIdx = stacksRef.current.findIndex(
        (s) => s.pages.some((p) => p.id === anchorPageId)
      );
      const targetStackIdx = stacksRef.current.findIndex((s) => s.id === stackId);
      if (anchorStackIdx !== -1 && targetStackIdx !== -1) {
        const start = Math.min(anchorStackIdx, targetStackIdx);
        const end = Math.max(anchorStackIdx, targetStackIdx);
        const rangePageIds = stacksRef.current
          .slice(start, end + 1)
          .flatMap((s) => s.pages.map((p) => p.id));
        setSelectedPageIds(new Set(rangePageIds));
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle all pages in stack
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        const allSelected = stackPageIds.every((id) => next.has(id));
        if (allSelected) {
          stackPageIds.forEach((id) => next.delete(id));
        } else {
          stackPageIds.forEach((id) => next.add(id));
        }
        return next;
      });
      setAnchorPageId(stackPageIds[0]);
    } else {
      // Plain click — select whole stack
      setSelectedPageIds(new Set(stackPageIds));
      setAnchorPageId(stackPageIds[0]);
      setScrollToPageId(stackPageIds[0]);
    }
  }, [anchorPageId]);

  const handleDeselect = useCallback(() => {
    setSelectedPageIds(new Set());
    setAnchorPageId(null);
  }, []);

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

  // Rotation is display-only until export: PdfThumbnail applies it via CSS
  // transform and PdfPage re-renders from its pageRef prop, so no thumbnail
  // invalidation is needed — cached bitmaps stay valid across rotations.
  const applyRotation = useCallback((pageIds: string[], degrees: number) => {
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
  }, [commit]);

  const resolveRotationTargets = useCallback((): string[] | null => {
    return selectedPageIds.size > 0 ? Array.from(selectedPageIds) : null;
  }, [selectedPageIds]);

  const handleRotate = useCallback((degrees: number) => {
    const pageIds = resolveRotationTargets();
    if (!pageIds || pageIds.length === 0) return;
    applyRotation(pageIds, degrees);
  }, [resolveRotationTargets, applyRotation]);

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

  // --- File input + export handlers (toolbar-adjacent) ---

  const handleBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
        e.target.value = "";
      }
    },
    [handleFilesAdded]
  );

  const handleExportAll = useCallback(async () => {
    if (stacks.length === 0) return;
    const bytes = await exportMergedPdf(stacks, loadSavedMetadata());
    downloadPdf(bytes, "hermitpdf-merged.pdf");
  }, [stacks]);

  const handleExportSelection = useCallback(async () => {
    if (selectedPageIds.size === 0) return;
    const filtered = stacks
      .map((s) => ({ ...s, pages: s.pages.filter((p) => selectedPageIds.has(p.id)) }))
      .filter((s) => s.pages.length > 0);
    if (filtered.length === 0) return;
    const bytes = await exportMergedPdf(filtered, loadSavedMetadata());
    const name = filtered.length === 1 ? filtered[0].name : "selection.pdf";
    downloadPdf(bytes, name);
  }, [stacks, selectedPageIds]);

  // --- Shared StackPanel props (avoids duplicating props between narrow vs. wide) ---

  const sharedStackPanelProps = useMemo(() => ({
    stacks,
    onFilesAdded: handleFilesAdded,
    onBrowseFiles: handleBrowse,
    onRemoveStack: handleRemoveStack,
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
    selectedPageIds,
    onPageClick: handlePageClick,
    onStackClick: handleStackClick,
    onExtractPageImages: handleExtractPageImages,
    onExtractStackImages: handleExtractStackImages,
    onDeselect: handleDeselect,
  }), [
    stacks, handleFilesAdded, handleBrowse, handleRemoveStack,
    handleReorderStack, handleContextMenu, handlePageContextMenu,
    handleSplitStack, contextMenu, viewMode, expandedStackIds,
    handleToggleExpand, handleReorderPage, handleExtractPageToList,
    handleInsertStackIntoExpanded, handleMovePageBetweenStacks,
    selectedPageIds, handlePageClick, handleStackClick,
    handleExtractPageImages, handleExtractStackImages,
    handleDeselect,
  ]);

  return (
    <>
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
      {oversizedFiles.length > 0 && (
        <DismissibleBanner
          message={t("oversizedFiles", { files: oversizedFiles.join(", ") })}
          dismissLabel={t("dismiss")}
          onDismiss={() => setOversizedFiles([])}
        />
      )}
      {noImagesFound && (
        <DismissibleBanner
          message={t("noImagesFound")}
          dismissLabel={t("dismiss")}
          onDismiss={clearNoImagesFound}
        />
      )}
      {metadataSaveFailed && (
        <DismissibleBanner
          message={t("metadataSaveFailed")}
          dismissLabel={t("dismiss")}
          onDismiss={() => setMetadataSaveFailed(false)}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-label={t("addFiles")}
      />
      <PanelHeader
        onAddFiles={handleBrowse}
        onClearAll={handleClearAll}
        clearAllDisabled={stacks.length === 0}
        previewVisible={previewVisible}
        onTogglePreview={!isNarrow ? togglePreview : undefined}
        onRotateLeft={() => handleRotate(-90)}
        onRotateRight={() => handleRotate(90)}
        rotateDisabled={!hasSelection}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onExtractAllImages={handleExtractAllImages}
        onExtractFocusedPage={handleExtractSelectedPages}
        extractAllDisabled={stacks.length === 0}
        extractPageDisabled={!hasSelection}
        isExtracting={isExtracting}
        onRemoveSelected={handleRemoveSelected}
        removeSelectedDisabled={!hasSelection}
        onExportAll={handleExportAll}
        onExportSelection={handleExportSelection}
        exportAllDisabled={stacks.length === 0}
        exportSelectionDisabled={selectedPageIds.size === 0}
        onEditProperties={() => setShowPropertiesModal(true)}
      />
      {isNarrow && (
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {isNarrow ? (
          activeTab === "documents" ? (
            <StackPanel
              {...sharedStackPanelProps}
              style={{ flex: 1 }}
            />
          ) : (
            <Workspace
              stacks={stacks}
              scrollToPageId={scrollToPageId}
              onScrollComplete={() => setScrollToPageId(null)}
            />
          )
        ) : (
          <>
            <StackPanel
              {...sharedStackPanelProps}
              style={{ flex: 1, minWidth: 0 }}
              previewVisible={previewVisible}
            />
            {previewVisible && (
              <>
                <ResizeDivider onPointerDown={handlePointerDown} />
                <Workspace
                  stacks={stacks}
                  isResizing={isResizing}
                  style={previewWidth > 0 ? { width: previewWidth, flex: "none" } : { flex: "0.4 1 0%" }}
                  scrollToPageId={scrollToPageId}
                  onScrollComplete={() => setScrollToPageId(null)}
                />
              </>
            )}
          </>
        )}
      </div>
      {showPropertiesModal && (
        <PropertiesModal
          onClose={() => setShowPropertiesModal(false)}
          onSaveFailed={() => setMetadataSaveFailed(true)}
        />
      )}
    </>
  );
}
