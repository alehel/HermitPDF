"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ScissorsIcon, TrashIcon, PlusCircleIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { PdfThumbnail } from "@/components/PdfThumbnail";
import { PageStack, WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { buildZip, downloadZip } from "@/lib/zipBuilder";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

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

function formatRangeFilename(stem: string, range: PageRange): string {
  return `${stem}_pages_${range.from}-${range.to}.pdf`;
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

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function SplitWizard() {
  const t = useTranslations("splitWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [ranges, setRanges] = useState<PageRange[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const showOverlay = useDelayedFlag(isSplitting);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
  } = usePdfIngestion();

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, pdfCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      setFile((prev) => {
        if (prev) releaseWizardFile(prev);
        return newFile;
      });
      setRanges([
        { id: crypto.randomUUID(), from: 1, to: newFile.pageCount },
      ]);

      if (pdfCount > 1) {
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

  /* ---- Remove the file ---- */
  const handleRemove = useCallback(() => {
    setFile((prev) => {
      if (prev) releaseWizardFile(prev);
      return null;
    });
    setRanges([]);
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

  /* ---- Split and download ---- */
  const handleSplit = useCallback(async () => {
    if (!file || ranges.length === 0) return;

    const validRanges = ranges.filter((r) =>
      isRangeValid(r, file.pageCount)
    );
    if (validRanges.length === 0) return;

    setIsSplitting(true);
    try {
      const stem = file.name.replace(/\.pdf$/i, "");

      if (validRanges.length === 1) {
        await exportSingleRangeAsPdf(file, validRanges[0], stem);
      } else {
        await exportRangesAsZip(file, validRanges, stem);
      }
    } finally {
      setIsSplitting(false);
    }
  }, [file, ranges]);

  /* ---- Computed values ---- */
  const validRanges = file
    ? ranges.filter((r) => isRangeValid(r, file.pageCount))
    : [];

  return (
    <>
      {fileInput}

      <ProcessingOverlay
        visible={showOverlay}
        title={t("overlayTitle")}
        description={t("overlayDescription")}
      />

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
      />

      <WizardContainer
        icon={<ScissorsIcon size={20} />}
        title={t("title")}
        empty={!file}
        footer={file ? {
          statusText: <><span className="font-medium text-foreground">{validRanges.length}</span>{" "}{t("rangesCount", { count: validRanges.length })}</>,
          buttonLabel: isSplitting ? t("splitting") : t("splitAndDownload"),
          onButtonClick: handleSplit,
          disabled: isSplitting || validRanges.length === 0,
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
              subtitle={`${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`}
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            {/* Range editor */}
            <div className="mt-6">
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
                          {/* First page */}
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
                          {/* Ellipsis when more than 2 pages */}
                          {previewPages.length > 2 && (
                            <span className="mb-3 -mr-[0.3em] text-4xl tracking-[0.3em] text-muted-foreground">
                              &hellip;
                            </span>
                          )}
                          {/* Last page (if different from first) */}
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
          </>
        )}
      </WizardContainer>
    </>
  );
}
