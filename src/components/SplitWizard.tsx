"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import {
  MoonIcon,
  SunIcon,
  ScissorsIcon,
  ArrowLeftIcon,
  TrashIcon,
  FileDocIcon,
  DownloadIcon,
  PlusCircleIcon,
} from "./Icons";
import { DropZone } from "./DropZone";
import { PdfThumbnail } from "./PdfThumbnail";
import { PageStack } from "@/lib/types";
import { ingestDocument } from "@/lib/pdfIngest";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { releaseDoc } from "@/lib/pdfStore";
import { releaseDocument } from "@/lib/mupdfClient";
import { buildZip, downloadZip } from "@/lib/zipBuilder";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SplitFile {
  id: string;
  stack: PageStack;
  name: string;
  pageCount: number;
  fileSize: number;
}

interface PageRange {
  id: string;
  from: number;
  to: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

/* ------------------------------------------------------------------ */
/*  Dismissible banner                                                  */
/* ------------------------------------------------------------------ */

function Banner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const t = useTranslations("splitWizard");
  return (
    <div className="flex items-center justify-between bg-accent px-4 py-2">
      <p className="text-xs text-foreground">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 shrink-0 text-xs font-medium text-primary hover:underline"
      >
        {t("dismiss")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function SplitWizard() {
  const t = useTranslations("splitWizard");
  const { theme, toggleTheme } = useTheme();

  const [file, setFile] = useState<SplitFile | null>(null);
  const [ranges, setRanges] = useState<PageRange[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef(file);
  fileRef.current = file;

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      const f = fileRef.current;
      if (f) {
        for (const page of f.stack.pages) {
          releaseDocument(page.sourceDocId);
          releaseDoc(page.sourceDocId);
        }
      }
    };
  }, []);

  /* ---- Release a file's resources ---- */
  const releaseFile = useCallback((f: SplitFile) => {
    for (const page of f.stack.pages) {
      releaseDocument(page.sourceDocId);
      releaseDoc(page.sourceDocId);
    }
  }, []);

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const allFiles = Array.from(fileList);
      const pdfFiles = allFiles.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf")
      );
      const rejected = allFiles
        .filter(
          (f) =>
            f.type !== "application/pdf" &&
            !f.name.toLowerCase().endsWith(".pdf")
        )
        .map((f) => f.name);
      const pwProtected: string[] = [];

      if (pdfFiles.length === 0) {
        if (rejected.length > 0) setRejectedFiles(rejected);
        return;
      }

      // Only use the first PDF
      const f = pdfFiles[0];
      try {
        const data = await f.arrayBuffer();
        const stack = await ingestDocument(data, f.name, f.size);
        const newFile: SplitFile = {
          id: crypto.randomUUID(),
          stack,
          name: f.name,
          pageCount: stack.pages.length,
          fileSize: f.size,
        };

        // Release previous file if any
        setFile((prev) => {
          if (prev) releaseFile(prev);
          return newFile;
        });

        // Initialize with one range covering the full document
        setRanges([
          { id: crypto.randomUUID(), from: 1, to: stack.pages.length },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("password") || msg.includes("encrypted")) {
          pwProtected.push(f.name);
        } else {
          rejected.push(f.name);
        }
      }

      if (pdfFiles.length > 1) {
        // Warn that we only used the first file
        setRejectedFiles([t("onlyOneFile")]);
      } else if (rejected.length > 0) {
        setRejectedFiles(rejected);
      }
      if (pwProtected.length > 0) setPasswordProtectedFiles(pwProtected);
    },
    [releaseFile, t]
  );

  /* ---- File input handler ---- */
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
        e.target.value = "";
      }
    },
    [handleFilesAdded]
  );

  /* ---- Remove the file ---- */
  const handleRemove = useCallback(() => {
    setFile((prev) => {
      if (prev) releaseFile(prev);
      return null;
    });
    setRanges([]);
  }, [releaseFile]);

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
        // Single range → download as single PDF
        const range = validRanges[0];
        const pages = file.stack.pages.slice(range.from - 1, range.to);
        const stack: PageStack = {
          id: crypto.randomUUID(),
          pages,
          name: file.name,
          size: 0,
        };
        const data = await exportMergedPdf([stack]);
        downloadPdf(data, `${stem}_pages_${range.from}-${range.to}.pdf`);
      } else {
        // Multiple ranges → ZIP
        const entries: { name: string; data: Uint8Array }[] = [];
        for (const range of validRanges) {
          const pages = file.stack.pages.slice(range.from - 1, range.to);
          const stack: PageStack = {
            id: crypto.randomUUID(),
            pages,
            name: file.name,
            size: 0,
          };
          const data = await exportMergedPdf([stack]);
          entries.push({
            name: `${stem}_pages_${range.from}-${range.to}.pdf`,
            data,
          });
        }
        const zipData = buildZip(entries);
        downloadZip(zipData, `${stem}_split.zip`);
      }
    } finally {
      setIsSplitting(false);
    }
  }, [file, ranges]);

  /* ---- Drop zone drag events ---- */
  const handleDropZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDropZoneDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.currentTarget &&
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDropZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files);
      }
    },
    [handleFilesAdded]
  );

  /* ---- Computed values ---- */
  const validRanges = file
    ? ranges.filter((r) => isRangeValid(r, file.pageCount))
    : [];

  /* ---- Hidden file input ---- */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      className="hidden"
      onChange={handleFileInput}
    />
  );

  /* ---- Header ---- */
  const header = (
    <header className="flex items-center gap-3 border-b border-border px-6 py-4">
      <Link
        href="/"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
        title={t("back")}
      >
        <ArrowLeftIcon />
      </Link>
      <Link href="/">
        <Image
          src={
            theme === "dark"
              ? "/hermitpdf-full-dark.svg"
              : "/hermitpdf-full.svg"
          }
          alt="HermitPDF"
          width={160}
          height={23}
        />
      </Link>
      <div className="ml-auto">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
          title="Toggle theme"
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  );

  const wizardTitle = (
    <div className="mb-6 flex items-center justify-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
        <ScissorsIcon className="!h-4 !w-4" />
      </div>
      <h1 className="text-lg font-medium text-foreground">{t("title")}</h1>
    </div>
  );

  /* ================================================================ */
  /*  Empty state                                                      */
  /* ================================================================ */
  if (!file) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {header}
        {fileInput}

        {rejectedFiles.length > 0 && (
          <Banner
            message={t("rejectedFiles", { files: rejectedFiles.join(", ") })}
            onDismiss={() => setRejectedFiles([])}
          />
        )}
        {passwordProtectedFiles.length > 0 && (
          <Banner
            message={t("passwordProtectedFiles", {
              files: passwordProtectedFiles.join(", "),
            })}
            onDismiss={() => setPasswordProtectedFiles([])}
          />
        )}

        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
          {wizardTitle}
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            isDragOver={isDragOver}
          />
        </main>
      </div>
    );
  }

  /* ================================================================ */
  /*  Populated state                                                  */
  /* ================================================================ */
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {header}
      {fileInput}

      {rejectedFiles.length > 0 && (
        <Banner
          message={t("rejectedFiles", { files: rejectedFiles.join(", ") })}
          onDismiss={() => setRejectedFiles([])}
        />
      )}
      {passwordProtectedFiles.length > 0 && (
        <Banner
          message={t("passwordProtectedFiles", {
            files: passwordProtectedFiles.join(", "),
          })}
          onDismiss={() => setPasswordProtectedFiles([])}
        />
      )}

      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <div className="w-full max-w-xl">
          {wizardTitle}

          {/* File card */}
          <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="text-primary">
              <FileDocIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pageCount", { count: file.pageCount })} &middot;{" "}
                {formatSize(file.fileSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
              title={t("remove")}
            >
              <TrashIcon />
            </button>
          </div>

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
                <PlusCircleIcon className="!h-4 !w-4" />
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
                      <div className="flex gap-2 overflow-x-auto border-t border-border px-3 py-3">
                        {previewPages.map((page, i) => (
                          <div
                            key={page.id}
                            className="flex shrink-0 flex-col items-center gap-1"
                          >
                            <PdfThumbnail
                              pageRef={page}
                              width={64}
                              className="shadow-sm"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {range.from + i}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{t("splitInfo")}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {validRanges.length}
            </span>{" "}
            {t("rangesCount", { count: validRanges.length })}
          </div>
          <button
            type="button"
            onClick={handleSplit}
            disabled={isSplitting || validRanges.length === 0}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-all hover:shadow-lg disabled:opacity-60"
          >
            <DownloadIcon />
            {isSplitting ? t("splitting") : t("splitAndDownload")}
          </button>
        </div>
      </footer>
    </div>
  );
}
