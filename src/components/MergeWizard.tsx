"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import {
  MoonIcon,
  SunIcon,
  MergeIcon,
  ArrowLeftIcon,
  GripIcon,
  TrashIcon,
  FileDocIcon,
  DownloadIcon,
  PlusCircleIcon,
} from "./Icons";
import { DropZone } from "./DropZone";
import { PageStack } from "@/lib/types";
import { ingestDocument } from "@/lib/pdfIngest";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { releaseDoc } from "@/lib/pdfStore";
import { releaseDocument } from "@/lib/mupdfClient";
import { useSortableDrag } from "@/hooks/useSortableDrag";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface MergeFile {
  id: string;
  stack: PageStack;
  name: string;
  pageCount: number;
  fileSize: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Dismissible banner (local — avoids coupling to documentPanel i18n) */
/* ------------------------------------------------------------------ */

function Banner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const t = useTranslations("mergeWizard");
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

export function MergeWizard() {
  const t = useTranslations("mergeWizard");
  const { theme, toggleTheme } = useTheme();

  const [files, setFiles] = useState<MergeFile[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      for (const file of filesRef.current) {
        for (const page of file.stack.pages) {
          releaseDocument(page.sourceDocId);
          releaseDoc(page.sourceDocId);
        }
      }
    };
  }, []);

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const allFiles = Array.from(fileList);
      const pdfFiles = allFiles.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      const rejected = allFiles
        .filter((f) => f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))
        .map((f) => f.name);
      const pwProtected: string[] = [];

      const results = await Promise.all(
        pdfFiles.map(async (f) => {
          try {
            const data = await f.arrayBuffer();
            const stack = await ingestDocument(data, f.name, f.size);
            return {
              id: crypto.randomUUID(),
              stack,
              name: f.name,
              pageCount: stack.pages.length,
              fileSize: f.size,
            } satisfies MergeFile;
          } catch (err) {
            const msg = err instanceof Error ? err.message.toLowerCase() : "";
            if (msg.includes("password") || msg.includes("encrypted")) {
              pwProtected.push(f.name);
            } else {
              rejected.push(f.name);
            }
            return null;
          }
        })
      );

      const newFiles = results.filter((r): r is MergeFile => r !== null);
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      if (rejected.length > 0) setRejectedFiles(rejected);
      if (pwProtected.length > 0) setPasswordProtectedFiles(pwProtected);
    },
    []
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

  /* ---- Remove a file ---- */
  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) {
        for (const page of removed.stack.pages) {
          releaseDocument(page.sourceDocId);
          releaseDoc(page.sourceDocId);
        }
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  /* ---- Reorder files ---- */
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setFiles((prev) => {
        if (fromIndex === toIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    []
  );

  /* ---- Merge and download ---- */
  const handleMerge = useCallback(async () => {
    if (files.length === 0) return;
    setIsMerging(true);
    try {
      const stacks = files.map((f) => f.stack);
      const data = await exportMergedPdf(stacks);
      downloadPdf(data, "merged.pdf");
    } finally {
      setIsMerging(false);
    }
  }, [files]);

  /* ---- Sortable drag for reordering ---- */
  const {
    dragIndex,
    handleDragOver: sortableDragOver,
    handleDragLeave,
    handleDrop: sortableDrop,
    handleItemDragStart,
    handleItemDragEnd,
    getItemStyle,
  } = useSortableDrag({
    itemCount: files.length,
    containerRef: listRef,
    itemSelector: "[data-merge-item]",
    layout: "list",
    acceptDrag: (e) =>
      e.dataTransfer.types.includes("text/x-merge-index") ||
      e.dataTransfer.types.includes("Files"),
    getDropEffect: (e) =>
      e.dataTransfer.types.includes("Files") ? "copy" : "move",
    onDrop: (e, toIndex) => {
      const fromStr = e.dataTransfer.getData("text/x-merge-index");
      if (fromStr) {
        handleReorder(parseInt(fromStr, 10), toIndex);
      } else if (e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files);
      }
    },
  });

  /* ---- Drop zone drag events (empty state) ---- */
  const handleDropZoneDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    []
  );

  const handleDropZoneDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (
        e.currentTarget &&
        !e.currentTarget.contains(e.relatedTarget as Node)
      ) {
        setIsDragOver(false);
      }
    },
    []
  );

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
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  /* ---- Hidden file input ---- */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      multiple
      className="hidden"
      onChange={handleFileInput}
    />
  );

  /* ---- Header (shared by both states) ---- */
  const header = (
    <>
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
          src={theme === "dark" ? "/hermitpdf-full-dark.svg" : "/hermitpdf-full.svg"}
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
    </>
  );

  const wizardTitle = (
    <div className="mb-6 flex items-center justify-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
        <MergeIcon className="!h-4 !w-4" />
      </div>
      <h1 className="text-lg font-medium text-foreground">{t("title")}</h1>
      {files.length > 0 && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
          {t("filesCount", { count: files.length })}
        </span>
      )}
    </div>
  );

  /* ================================================================ */
  /*  Empty state                                                      */
  /* ================================================================ */
  if (files.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {header}
        {fileInput}

        {/* Error banners */}
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

      {/* Error banners */}
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

      {/* File list */}
      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <div className="w-full max-w-xl">
          {wizardTitle}
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("dragToReorder")}
          </p>

          <div
            ref={listRef}
            className="space-y-2"
            onDragOver={sortableDragOver}
            onDragLeave={handleDragLeave}
            onDrop={sortableDrop}
          >
            {files.map((file, i) => (
              <div
                key={file.id}
                data-merge-item
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/x-merge-index", String(i));
                  handleItemDragStart(i, e);
                }}
                onDragEnd={handleItemDragEnd}
                style={getItemStyle(i)}
                className={`group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all ${
                  dragIndex === i
                    ? "border-primary opacity-0"
                    : "border-border hover:border-primary/40 hover:shadow-sm"
                }`}
              >
                {/* Drag handle */}
                <div className="cursor-grab text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing">
                  <GripIcon />
                </div>

                {/* Order badge */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                  {i + 1}
                </span>

                {/* File icon */}
                <div className="text-primary">
                  <FileDocIcon />
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("pageCount", { count: file.pageCount })} &middot;{" "}
                    {formatSize(file.fileSize)}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(file.id)}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          {/* Add more files */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition-all ${
              isDragOver
                ? "border-primary bg-accent/30 text-primary"
                : "border-border bg-card/50 text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            <PlusCircleIcon />
            {t("addMoreFiles")}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalPages}</span>{" "}
            {t("pagesTotal")}
          </div>
          <button
            type="button"
            onClick={handleMerge}
            disabled={isMerging}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-all hover:shadow-lg disabled:opacity-60"
          >
            <DownloadIcon />
            {isMerging ? t("merging") : t("mergeAndDownload")}
          </button>
        </div>
      </footer>
    </div>
  );
}
