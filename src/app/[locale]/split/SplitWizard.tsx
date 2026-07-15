"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ScissorsIcon, TrashIcon, PlusCircleIcon, ChevronDownIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { IngestionOverlay } from "@/components/IngestionOverlay";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { PdfThumbnail } from "@/components/PdfThumbnail";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OutlineEntry, PageStack, WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { loadOutline } from "@/lib/mupdfClient";
import { buildZip, downloadZip } from "@/lib/zipBuilder";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

/* ------------------------------------------------------------------ */
/*  Types and helpers                                                   */
/* ------------------------------------------------------------------ */

type SplitMode = "ranges" | "toc";
type OutlineState = "idle" | "loading" | "loaded" | "none";

interface PageRange {
  id: string;
  from: number;
  to: number;
}

function isRangeValid(range: PageRange, pageCount: number): boolean {
  return (
    range.from >= 1 &&
    range.to >= 1 &&
    range.from <= pageCount &&
    range.to <= pageCount &&
    range.from <= range.to
  );
}

function buildStackFromRange(file: WizardFile, range: PageRange): PageStack {
  const pages = file.stack.pages.slice(range.from - 1, range.to);
  return {
    id: crypto.randomUUID(),
    pages,
    name: file.name,
    size: 0,
  };
}

function buildStackFromOutline(file: WizardFile, entry: OutlineEntry): PageStack {
  const pages = file.stack.pages.slice(entry.pageStart, entry.pageEnd + 1);
  return {
    id: crypto.randomUUID(),
    pages,
    name: entry.title,
    size: 0,
  };
}

function formatRangeFilename(stem: string, range: PageRange): string {
  return `${stem}_pages_${range.from}-${range.to}.pdf`;
}

function sanitizeForFilename(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "section";
}

function sanitizeSeparator(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "");
}

function buildOutlineFilename(
  entry: OutlineEntry,
  prefix: string,
  separator: string,
  sequenceNumber: number | null,
  totalCount: number
): string {
  const parts: string[] = [];
  const cleanPrefix = prefix.trim();
  if (cleanPrefix) parts.push(sanitizeForFilename(cleanPrefix));
  if (sequenceNumber !== null) {
    const digits = Math.max(2, String(totalCount).length);
    parts.push(String(sequenceNumber).padStart(digits, "0"));
  }
  parts.push(sanitizeForFilename(entry.title));
  return parts.join(sanitizeSeparator(separator)) + ".pdf";
}

function dedupeFilename(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const stem = name.replace(/\.pdf$/i, "");
  let i = 2;
  while (true) {
    const cand = `${stem}_${i}.pdf`;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
    i++;
  }
}

async function exportSingleRangeAsPdf(
  file: WizardFile,
  range: PageRange,
  stem: string
): Promise<void> {
  const data = await exportMergedPdf([buildStackFromRange(file, range)]);
  downloadPdf(data, formatRangeFilename(stem, range));
}

async function exportRangesAsZip(
  file: WizardFile,
  ranges: PageRange[],
  stem: string
): Promise<void> {
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const range of ranges) {
    const data = await exportMergedPdf([buildStackFromRange(file, range)]);
    entries.push({ name: formatRangeFilename(stem, range), data });
  }
  const zipData = buildZip(entries);
  downloadZip(zipData, `${stem}_split.zip`);
}

async function exportOutlineSelection(
  file: WizardFile,
  outline: OutlineEntry[],
  selected: Set<string>,
  prefix: string,
  separator: string,
  addSequence: boolean,
  zipStem: string
): Promise<void> {
  // Preserve outline order, not selection-click order.
  const picks = outline.filter((e) => selected.has(e.id));
  if (picks.length === 0) return;

  const used = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < picks.length; i++) {
    const entry = picks[i];
    const data = await exportMergedPdf([buildStackFromOutline(file, entry)]);
    const baseName = buildOutlineFilename(
      entry,
      prefix,
      separator,
      addSequence ? i + 1 : null,
      picks.length
    );
    entries.push({ name: dedupeFilename(baseName, used), data });
  }

  if (entries.length === 1) {
    downloadPdf(entries[0].data, entries[0].name);
  } else {
    const zipData = buildZip(entries);
    downloadZip(zipData, `${zipStem}_sections.zip`);
  }
}

/* ------------------------------------------------------------------ */
/*  Outline tree row                                                    */
/* ------------------------------------------------------------------ */

interface OutlineRowProps {
  entry: OutlineEntry;
  selected: boolean;
  collapsed: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleCollapse: (id: string) => void;
}

function OutlineRow({
  entry,
  selected,
  collapsed,
  onToggleSelect,
  onToggleCollapse,
}: OutlineRowProps) {
  const isSinglePage = entry.pageStart === entry.pageEnd;
  const rangeLabel = isSinglePage
    ? `p. ${entry.pageStart + 1}`
    : `p. ${entry.pageStart + 1}–${entry.pageEnd + 1}`;
  const pageSpan = entry.pageEnd - entry.pageStart + 1;

  return (
    <div
      className="group flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-muted/40"
      style={{ paddingLeft: 12 + entry.level * 20 }}
    >
      {entry.hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleCollapse(entry.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDownIcon
            size={14}
            style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 120ms" }}
          />
        </button>
      ) : (
        <div className="h-5 w-5 shrink-0" />
      )}
      <label className="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(entry.id, e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-border accent-primary"
        />
        <span className="truncate text-sm text-foreground" title={entry.title}>
          {entry.title}
        </span>
      </label>
      <span
        className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
        title={`${pageSpan} page${pageSpan === 1 ? "" : "s"}`}
      >
        {rangeLabel}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function SplitWizard() {
  const t = useTranslations("splitWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [mode, setMode] = useState<SplitMode>("ranges");
  const [ranges, setRanges] = useState<PageRange[]>([]);

  // Outline state
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null);
  const [outlineState, setOutlineState] = useState<OutlineState>("idle");
  const [selectedOutline, setSelectedOutline] = useState<Set<string>>(new Set());
  const [collapsedOutline, setCollapsedOutline] = useState<Set<string>>(new Set());
  const [filenamePrefix, setFilenamePrefix] = useState("");
  const [filenameSeparator, setFilenameSeparator] = useState(" ");
  const [addSequenceNumbers, setAddSequenceNumbers] = useState(false);

  const [isSplitting, setIsSplitting] = useState(false);
  const showOverlay = useDelayedFlag(isSplitting);

  const fileRef = useRef(file);
  fileRef.current = file;

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
  } = usePdfIngestion();

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, fileCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      const prev = fileRef.current;
      if (prev) releaseWizardFile(prev);
      setFile(newFile);
      setRanges([
        { id: crypto.randomUUID(), from: 1, to: newFile.pageCount },
      ]);

      // Reset outline state — will be reloaded by the effect below.
      setOutline(null);
      setOutlineState("idle");
      setSelectedOutline(new Set());
      setCollapsedOutline(new Set());

      if (fileCount > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      }
    },
    [ingestFiles, setRejectedFiles, t]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { ariaLabel: t("dropTitle") });

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      const f = fileRef.current;
      if (f) releaseWizardFile(f);
    };
  }, []);

  /* ---- Load outline when file changes ---- */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setOutlineState("loading");
    loadOutline(file.sourceDocId).then(
      (entries) => {
        if (cancelled) return;
        if (!entries || entries.length === 0) {
          setOutline(null);
          setOutlineState("none");
          return;
        }
        setOutline(entries);
        setOutlineState("loaded");
      },
      () => {
        if (cancelled) return;
        setOutline(null);
        setOutlineState("none");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  /* ---- Remove the file ---- */
  const handleRemove = useCallback(() => {
    const prev = fileRef.current;
    if (prev) releaseWizardFile(prev);
    setFile(null);
    setRanges([]);
    setOutline(null);
    setOutlineState("idle");
    setSelectedOutline(new Set());
    setCollapsedOutline(new Set());
    setMode("ranges");
  }, []);

  /* ---- Range management ---- */
  const handleAddRange = useCallback(() => {
    if (!file) return;
    setRanges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: 1, to: file.pageCount },
    ]);
  }, [file]);

  const handleRemoveRange = useCallback((id: string) => {
    setRanges((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleRangeChange = useCallback(
    (id: string, field: "from" | "to", value: number) => {
      setRanges((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  /* ---- Outline selection ---- */
  const handleToggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedOutline((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedOutline((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!outline) return;
    setSelectedOutline(new Set(outline.map((e) => e.id)));
  }, [outline]);

  const selectNone = useCallback(() => {
    setSelectedOutline(new Set());
  }, []);

  const selectByLevel = useCallback(
    (level: number) => {
      if (!outline) return;
      setSelectedOutline(new Set(outline.filter((e) => e.level === level).map((e) => e.id)));
    },
    [outline]
  );

  const collapseAll = useCallback(() => {
    if (!outline) return;
    setCollapsedOutline(new Set(outline.filter((e) => e.hasChildren).map((e) => e.id)));
  }, [outline]);

  const expandAll = useCallback(() => {
    setCollapsedOutline(new Set());
  }, []);

  /* ---- Computed values ---- */
  const validRanges = useMemo(
    () => (file ? ranges.filter((r) => isRangeValid(r, file.pageCount)) : []),
    [file, ranges]
  );

  const availableLevels = useMemo(() => {
    if (!outline) return [];
    const levels = new Set(outline.map((e) => e.level));
    return [...levels].sort((a, b) => a - b);
  }, [outline]);

  const visibleOutline = useMemo(() => {
    if (!outline) return [];
    // Build parent lookup once
    const byId = new Map(outline.map((e) => [e.id, e] as const));
    return outline.filter((entry) => {
      let p: string | null = entry.parentId;
      while (p !== null) {
        if (collapsedOutline.has(p)) return false;
        const parent = byId.get(p);
        p = parent ? parent.parentId : null;
      }
      return true;
    });
  }, [outline, collapsedOutline]);

  const filenameSample = useMemo(() => {
    if (!outline || selectedOutline.size === 0) return null;
    const first = outline.find((e) => selectedOutline.has(e.id));
    if (!first) return null;
    return buildOutlineFilename(
      first,
      filenamePrefix,
      filenameSeparator,
      addSequenceNumbers ? 1 : null,
      selectedOutline.size
    );
  }, [outline, selectedOutline, filenamePrefix, filenameSeparator, addSequenceNumbers]);

  /* ---- Split and download ---- */
  const handleSplit = useCallback(async () => {
    if (!file) return;

    if (mode === "ranges") {
      const list = ranges.filter((r) => isRangeValid(r, file.pageCount));
      if (list.length === 0) return;
      setIsSplitting(true);
      try {
        const stem = file.name.replace(/\.pdf$/i, "");
        if (list.length === 1) {
          await exportSingleRangeAsPdf(file, list[0], stem);
        } else {
          await exportRangesAsZip(file, list, stem);
        }
      } finally {
        setIsSplitting(false);
      }
      return;
    }

    if (!outline || selectedOutline.size === 0) return;
    setIsSplitting(true);
    try {
      const stem = file.name.replace(/\.pdf$/i, "");
      await exportOutlineSelection(
        file,
        outline,
        selectedOutline,
        filenamePrefix,
        filenameSeparator,
        addSequenceNumbers,
        stem
      );
    } finally {
      setIsSplitting(false);
    }
  }, [file, mode, ranges, outline, selectedOutline, filenamePrefix, filenameSeparator, addSequenceNumbers]);

  /* ---- Footer state derived from mode ---- */
  const footerStatus =
    mode === "ranges" ? (
      <>
        <span className="font-medium text-foreground">{validRanges.length}</span>{" "}
        {t("rangesCount", { count: validRanges.length })}
      </>
    ) : (
      <>
        <span className="font-medium text-foreground">{selectedOutline.size}</span>{" "}
        {t("sectionsCount", { count: selectedOutline.size })}
      </>
    );

  const footerDisabled =
    isSplitting ||
    (mode === "ranges" ? validRanges.length === 0 : selectedOutline.size === 0);

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
        icon={<ScissorsIcon size={20} />}
        title={t("title")}
        empty={!file}
        footer={file ? {
          statusText: footerStatus,
          buttonLabel: isSplitting ? t("splitting") : t("splitAndDownload"),
          onButtonClick: handleSplit,
          disabled: footerDisabled,
        } : undefined}
      >
        {!file ? (
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
          <>
            <FileCard
              name={file.name}
              subtitle={`${t("pageCount", { count: file.pageCount })} · ${formatSize(file.fileSize)}`}
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            {/* Mode tabs */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as SplitMode)} className="mt-6">
              <TabsList>
                <TabsTrigger value="ranges">{t("modeRanges")}</TabsTrigger>
                <TabsTrigger value="toc">
                  {t("modeToc")}
                  {outlineState === "loaded" && outline && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {outline.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ====== Page ranges tab ====== */}
              <TabsContent value="ranges">
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {t("pageRanges")}
                    </p>
                    <button
                      type="button"
                      onClick={handleAddRange}
                      className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                    >
                      <PlusCircleIcon size={16} />
                      {t("addRange")}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {ranges.map((range) => {
                      const valid = isRangeValid(range, file.pageCount);
                      const previewPages = valid
                        ? file.stack.pages.slice(range.from - 1, range.to)
                        : [];
                      return (
                        <div
                          key={range.id}
                          className={`rounded-xl border bg-card ${
                            valid
                              ? "border-border"
                              : "border-red-400/50 bg-red-500/5"
                          }`}
                        >
                          <div className="flex items-center gap-3 p-3">
                            <span className="text-sm text-muted-foreground">
                              {t("pages")}
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={file.pageCount}
                              value={range.from}
                              onChange={(e) =>
                                handleRangeChange(
                                  range.id,
                                  "from",
                                  parseInt(e.target.value, 10) || 1
                                )
                              }
                              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground outline-none focus:border-primary"
                            />
                            <span className="text-sm text-muted-foreground">{t("to")}</span>
                            <input
                              type="number"
                              min={1}
                              max={file.pageCount}
                              value={range.to}
                              onChange={(e) =>
                                handleRangeChange(
                                  range.id,
                                  "to",
                                  parseInt(e.target.value, 10) || 1
                                )
                              }
                              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm text-foreground outline-none focus:border-primary"
                            />
                            <span className="flex-1 text-xs text-muted-foreground">
                              / {file.pageCount}
                            </span>
                            {!valid && (
                              <span className="text-xs text-red-500">
                                {t("invalidRange")}
                              </span>
                            )}
                            {ranges.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRange(range.id)}
                                className="rounded-lg p-1 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500"
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                          {previewPages.length > 0 && (
                            <div className="flex items-end justify-center gap-4 border-t border-border px-3 py-4">
                              <div className="flex shrink-0 flex-col items-center gap-1">
                                <PdfThumbnail
                                  pageRef={previewPages[0]}
                                  width={120}
                                  className="shadow-sm"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {range.from}
                                </span>
                              </div>
                              {previewPages.length > 2 && (
                                <span className="mb-3 -mr-[0.3em] text-4xl tracking-[0.3em] text-muted-foreground">
                                  &hellip;
                                </span>
                              )}
                              {previewPages.length > 1 && (
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <PdfThumbnail
                                    pageRef={previewPages[previewPages.length - 1]}
                                    width={120}
                                    className="shadow-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {range.to}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">{t("splitInfo")}</p>
                </div>
              </TabsContent>

              {/* ====== Table of contents tab ====== */}
              <TabsContent value="toc">
                <div className="mt-4">
                  {outlineState === "loading" && (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      {t("tocLoading")}
                    </div>
                  )}

                  {outlineState === "none" && (
                    <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
                      <p className="text-sm font-medium text-foreground">{t("tocNoneTitle")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("tocNoneDescription")}</p>
                    </div>
                  )}

                  {outlineState === "loaded" && outline && (
                    <>
                      {/* Filename controls */}
                      <div className="mb-4 rounded-xl border border-border bg-card p-3">
                        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {t("output")}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{t("filenamePrefix")}</span>
                            <input
                              type="text"
                              value={filenamePrefix}
                              onChange={(e) => setFilenamePrefix(e.target.value)}
                              placeholder={t("filenamePrefixPlaceholder")}
                              className="w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{t("filenameSeparator")}</span>
                            <input
                              type="text"
                              value={filenameSeparator}
                              onChange={(e) => setFilenameSeparator(e.target.value)}
                              maxLength={5}
                              className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center font-mono text-sm text-foreground outline-none focus:border-primary"
                            />
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={addSequenceNumbers}
                              onChange={(e) => setAddSequenceNumbers(e.target.checked)}
                              className="h-4 w-4 rounded border-border accent-primary"
                            />
                            <span className="text-foreground">{t("addSequenceNumbers")}</span>
                          </label>
                        </div>
                        {filenameSample && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("filenamePreview")}{" "}
                            <span className="font-mono text-foreground">{filenameSample}</span>
                          </p>
                        )}
                      </div>

                      {/* Selection toolbar */}
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {t("select")}
                        </span>
                        <button
                          type="button"
                          onClick={selectAll}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          {t("selectAll")}
                        </button>
                        {availableLevels.map((lv) => (
                          <button
                            type="button"
                            key={lv}
                            onClick={() => selectByLevel(lv)}
                            className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            {t("selectLevel", { level: lv + 1 })}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={selectNone}
                          className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          {t("selectNone")}
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={expandAll}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t("expandAll")}
                          </button>
                          <span className="text-xs text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={collapseAll}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t("collapseAll")}
                          </button>
                        </div>
                      </div>

                      {/* Tree */}
                      <div className="overflow-hidden rounded-xl border border-border bg-card">
                        {visibleOutline.map((entry) => (
                          <OutlineRow
                            key={entry.id}
                            entry={entry}
                            selected={selectedOutline.has(entry.id)}
                            collapsed={collapsedOutline.has(entry.id)}
                            onToggleSelect={handleToggleSelect}
                            onToggleCollapse={handleToggleCollapse}
                          />
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">{t("tocSplitInfo")}</p>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </WizardContainer>
    </>
  );
}
