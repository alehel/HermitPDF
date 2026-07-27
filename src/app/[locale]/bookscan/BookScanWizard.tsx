"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BookIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { IngestionOverlay } from "@/components/IngestionOverlay";
import { WizardContainer } from "@/components/WizardContainer";
import { CropEditor } from "@/components/CropEditor";
import { PdfThumbnail } from "@/components/PdfThumbnail";
import type { WizardFile } from "@/lib/types";
import { ACCEPT_ATTRIBUTE } from "@/lib/fileDetect";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import {
  bookScanFilename,
  clampSplit,
  cropRegions,
  defaultSplit,
  DPI_CHOICES,
  FALLBACK_OUTPUT_DPI,
  FULL_CROP,
  guessKind,
  matchOutputDpi,
  OUTPUT_PAGE_HEIGHT_PT,
  outputPageCount,
  renderDpiForRegion,
  type ScanItem,
  type ScanKind,
} from "@/lib/bookscan";
import {
  beginBookScanExport,
  getPageDpi,
  getPageSize,
  renderPage,
} from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

/** Longest preview dimension in pixels — keeps huge scans responsive. */
const MAX_PREVIEW_PX = 1600;

export function BookScanWizard() {
  const t = useTranslations("bookScanWizard");

  const [items, setItems] = useState<ScanItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "match" follows the lowest-resolution scan; a number is an explicit,
  // lower, user-chosen output DPI.
  const [outputDpi, setOutputDpi] = useState<number | "match">("match");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const showOverlay = useDelayedFlag(isExporting);

  const [previewImage, setPreviewImage] = useState<ImageData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Source files by WizardFile id, kept out of render state — only needed to
  // release OPFS/worker resources when the last item of a file is removed.
  const filesRef = useRef<Map<string, WizardFile>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const {
    ingestFiles,
    isIngesting,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
    environmentUnsupported,
    setEnvironmentUnsupported,
  } = usePdfIngestion({ acceptImages: true });

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files } = await ingestFiles(fileList);
      if (files.length === 0) return;

      const newItems: ScanItem[] = [];
      for (const file of files) {
        filesRef.current.set(file.id, file);
        for (let i = 0; i < file.stack.pages.length; i++) {
          const page = file.stack.pages[i];
          const [{ widthPt, heightPt }, nativeDpi] = await Promise.all([
            getPageSize(page.sourceDocId, page.sourcePageIndex),
            getPageDpi(page.sourceDocId, page.sourcePageIndex),
          ]);
          newItems.push({
            id: page.id,
            fileId: file.id,
            sourceDocId: page.sourceDocId,
            pageIndex: page.sourcePageIndex,
            label:
              file.stack.pages.length > 1 ? `${file.name} · ${i + 1}` : file.name,
            kind: guessKind(widthPt, heightPt),
            crop: FULL_CROP,
            split: defaultSplit(FULL_CROP),
            widthPt,
            heightPt,
            nativeDpi,
          });
        }
      }
      setItems((prev) => [...prev, ...newItems]);
      setSelectedId((prev) => prev ?? newItems[0]?.id ?? null);
    },
    [ingestFiles]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { multiple: true, ariaLabel: t("dropTitle"), accept: ACCEPT_ATTRIBUTE });

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    const files = filesRef.current;
    return () => {
      for (const file of files.values()) releaseWizardFile(file);
      files.clear();
    };
  }, []);

  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId]
  );

  const updateSelected = useCallback(
    (patch: Partial<ScanItem>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === selectedId ? { ...it, ...patch } : it))
      );
    },
    [selectedId]
  );

  /* ---- Item list actions ---- */
  const handleRemove = useCallback((id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    if (!item) return;
    const remaining = itemsRef.current.filter(
      (it) => it.fileId === item.fileId && it.id !== id
    );
    if (remaining.length === 0) {
      const file = filesRef.current.get(item.fileId);
      // Deferred outside the updater: Strict Mode double-invokes updaters and
      // a double release would race in OPFS.
      if (file) {
        releaseWizardFile(file);
        filesRef.current.delete(item.fileId);
      }
    }
  }, []);

  const handleMove = useCallback((id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((it) => it.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleKindChange = useCallback(
    (kind: ScanKind) => {
      if (!selected) return;
      updateSelected({ kind, split: clampSplit(selected.split, selected.crop) });
    },
    [selected, updateSelected]
  );

  const handleCropChange = useCallback(
    (crop: ScanItem["crop"]) => {
      if (!selected) return;
      updateSelected({ crop, split: clampSplit(selected.split, crop) });
    },
    [selected, updateSelected]
  );

  const handleApplyToSameKind = useCallback(() => {
    if (!selected) return;
    setItems((prev) =>
      prev.map((it) =>
        it.kind === selected.kind
          ? { ...it, crop: selected.crop, split: clampSplit(selected.split, selected.crop) }
          : it
      )
    );
  }, [selected]);

  /* ---- Preview render for the selected scan ---- */
  useEffect(() => {
    if (!selected) {
      setPreviewImage(null);
      return;
    }
    let cancelled = false;
    setIsPreviewLoading(true);
    const scale = Math.min(
      2,
      MAX_PREVIEW_PX / Math.max(selected.widthPt, selected.heightPt)
    );
    renderPage(selected.sourceDocId, selected.pageIndex, scale)
      .then((imageData) => {
        if (!cancelled) setPreviewImage(imageData);
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only the page identity matters — crop edits must not re-render.
  }, [selected?.sourceDocId, selected?.pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Output resolution ----
     The cap follows the lowest-resolution scan, so it shifts as items and
     crops change; an explicit choice at or above the current cap is
     equivalent to matching it. */
  const matchDpi = useMemo(() => matchOutputDpi(items), [items]);
  const capDpi = matchDpi ?? FALLBACK_OUTPUT_DPI;
  const effectiveDpi = outputDpi === "match" ? capDpi : Math.min(outputDpi, capDpi);
  const lowerChoices = DPI_CHOICES.filter((dpi) => dpi < capDpi);

  /* ---- Export ---- */
  const handleExport = useCallback(async () => {
    const exportItems = itemsRef.current;
    if (exportItems.length === 0) return;
    const total = outputPageCount(exportItems);
    setIsExporting(true);
    setExportProgress({ done: 0, total });

    const build = beginBookScanExport();
    try {
      let done = 0;
      for (const item of exportItems) {
        for (const region of cropRegions(item)) {
          const cropHeightPt = item.heightPt * (region.y1 - region.y0);
          await build.addPage(
            item.sourceDocId,
            item.pageIndex,
            renderDpiForRegion(effectiveDpi, cropHeightPt),
            region,
            OUTPUT_PAGE_HEIGHT_PT,
            { format: "jpeg", quality: 90 }
          );
          done++;
          setExportProgress({ done, total });
        }
      }
      const data = await build.finish();
      const firstFile = filesRef.current.get(exportItems[0].fileId);
      downloadPdf(data, bookScanFilename(firstFile?.name ?? "book"));
    } finally {
      // No-op after a successful finish; frees the worker-side document if
      // the export failed or was interrupted partway.
      void build.abort();
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [effectiveDpi]);

  const isEmpty = items.length === 0;
  const totalOutputPages = outputPageCount(items);

  const exportLabel = isExporting
    ? exportProgress
      ? t("exportingProgress", { done: exportProgress.done, total: exportProgress.total })
      : t("exporting")
    : t("downloadPdf");

  const sameKindCount = selected
    ? items.filter((it) => it.kind === selected.kind).length - 1
    : 0;

  return (
    <>
      {fileInput}

      <IngestionOverlay active={isIngesting} />

      <ProcessingOverlay
        visible={showOverlay}
        title={t("overlayTitle")}
        description={t("overlayDescription")}
      />

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        oversizedMessage={oversizedFiles.length > 0 ? t("oversizedFiles", { files: oversizedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
        onDismissOversized={() => setOversizedFiles([])}
        environmentUnsupported={environmentUnsupported}
        onDismissEnvironmentUnsupported={() => setEnvironmentUnsupported(false)}
      />

      <WizardContainer
        icon={<BookIcon size={20} />}
        title={t("title")}
        empty={isEmpty}
        wide={!isEmpty}
        footer={!isEmpty ? {
          statusText: t("outputSummary", { count: totalOutputPages }),
          buttonLabel: exportLabel,
          onButtonClick: handleExport,
          disabled: isExporting,
        } : undefined}
      >
        {isEmpty ? (
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={openFilePicker}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            isDragOver={isDragOver}
            autoFocus
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
            {/* Scan list */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("scans")}
                </h3>
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <PlusIcon size={14} />
                  {t("addMore")}
                </button>
              </div>

              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                        item.id === selectedId
                          ? "border-primary bg-accent"
                          : "border-border bg-card hover:bg-accent"
                      }`}
                    >
                      <PdfThumbnail
                        pageRef={{
                          id: item.id,
                          sourceDocId: item.sourceDocId,
                          sourcePageIndex: item.pageIndex,
                          rotation: 0,
                        }}
                        width={48}
                        boxAspectRatio={1.2}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.kind === "spread" ? t("spreadBadge") : t("singleBadge")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMove(item.id, -1); }}
                          disabled={index === 0}
                          title={t("moveUp")}
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleMove(item.id, 1); }}
                          disabled={index === items.length - 1}
                          title={t("moveDown")}
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                          title={t("remove")}
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("outputResolution")}
                </h3>
                <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-1">
                  <button
                    type="button"
                    onClick={() => setOutputDpi("match")}
                    className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      effectiveDpi === capDpi
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {t("matchResolution", { dpi: Math.round(capDpi) })}
                  </button>
                  {lowerChoices.map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setOutputDpi(dpi)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        effectiveDpi === dpi
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t("dpiOption", { dpi })}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("outputResolutionHint")}</p>
              </div>
            </div>

            {/* Editor for the selected scan */}
            <div className="lg:sticky lg:top-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("editor")}
              </h3>

              {selected ? (
                <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-1 rounded-lg border border-border p-1">
                      {(["single", "spread"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => handleKindChange(kind)}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            selected.kind === kind
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {kind === "single" ? t("kindSingle") : t("kindSpread")}
                        </button>
                      ))}
                    </div>
                    {isPreviewLoading && (
                      <span className="text-xs text-muted-foreground">{t("rendering")}</span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {selected.kind === "spread" ? t("cropHintSpread") : t("cropHintSingle")}
                  </p>

                  <CropEditor
                    imageData={previewImage}
                    crop={selected.crop}
                    split={selected.kind === "spread" ? selected.split : null}
                    splitLabel={t("gutter")}
                    onCropChange={handleCropChange}
                    onSplitChange={(split) => updateSelected({ split })}
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateSelected({ crop: FULL_CROP, split: defaultSplit(FULL_CROP) })}
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t("resetCrop")}
                    </button>
                    {sameKindCount > 0 && (
                      <button
                        type="button"
                        onClick={handleApplyToSameKind}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {selected.kind === "spread"
                          ? t("applyToAllSpreads", { count: sameKindCount })
                          : t("applyToAllSingles", { count: sameKindCount })}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {t("selectHint")}
                </div>
              )}
            </div>
          </div>
        )}
      </WizardContainer>
    </>
  );
}
