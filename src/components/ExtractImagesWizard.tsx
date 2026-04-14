"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import {
  MoonIcon,
  SunIcon,
  ExtractIcon,
  ArrowLeftIcon,
  TrashIcon,
  FileDocIcon,
  DownloadIcon,
} from "./Icons";
import { DropZone } from "./DropZone";
import { PageStack, ExtractedImage } from "@/lib/types";
import { ingestDocument } from "@/lib/pdfIngest";
import { extractImagesFromDocument, releaseDocument } from "@/lib/mupdfClient";
import { downloadImages, downloadSingleImage } from "@/lib/imageExport";
import { releaseDoc } from "@/lib/pdfStore";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ExtractFile {
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
/*  Dismissible banner                                                  */
/* ------------------------------------------------------------------ */

function Banner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const t = useTranslations("extractImagesWizard");
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

export function ExtractImagesWizard() {
  const t = useTranslations("extractImagesWizard");
  const { theme, toggleTheme } = useTheme();

  const [file, setFile] = useState<ExtractFile | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [noImagesFound, setNoImagesFound] = useState(false);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
  const releaseFile = useCallback((f: ExtractFile) => {
    for (const page of f.stack.pages) {
      releaseDocument(page.sourceDocId);
      releaseDoc(page.sourceDocId);
    }
  }, []);

  /* ---- Extract images (auto-triggered on file load) ---- */
  const handleExtract = useCallback(async (f: ExtractFile) => {
    setIsExtracting(true);
    setNoImagesFound(false);
    setExtractedImages([]);
    try {
      const docId = f.stack.pages[0].sourceDocId;
      const images = await extractImagesFromDocument(docId);
      if (images.length === 0) {
        setNoImagesFound(true);
      } else {
        setExtractedImages(images);
      }
    } finally {
      setIsExtracting(false);
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

      const f = pdfFiles[0];
      try {
        const data = await f.arrayBuffer();
        const stack = await ingestDocument(data, f.name, f.size);
        const newFile: ExtractFile = {
          id: crypto.randomUUID(),
          stack,
          name: f.name,
          pageCount: stack.pages.length,
          fileSize: f.size,
        };

        setFile((prev) => {
          if (prev) releaseFile(prev);
          return newFile;
        });
        setNoImagesFound(false);
        handleExtract(newFile);
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("password") || msg.includes("encrypted")) {
          pwProtected.push(f.name);
        } else {
          rejected.push(f.name);
        }
      }

      if (pdfFiles.length > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      } else if (rejected.length > 0) {
        setRejectedFiles(rejected);
      }
      if (pwProtected.length > 0) setPasswordProtectedFiles(pwProtected);
    },
    [releaseFile, handleExtract, t]
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
    setNoImagesFound(false);
    setExtractedImages([]);
  }, [releaseFile]);

  /* ---- Download all images ---- */
  const handleDownloadAll = useCallback(() => {
    if (!file || extractedImages.length === 0) return;
    downloadImages(extractedImages, file.name);
  }, [file, extractedImages]);

  /* ---- Download a single image ---- */
  const handleDownloadOne = useCallback(
    (img: ExtractedImage) => {
      if (!file) return;
      const stem = file.name.replace(/\.pdf$/i, "");
      downloadSingleImage(
        img.pngData,
        `${stem}_p${img.pageIndex + 1}_img${img.imageIndex + 1}.png`
      );
    },
    [file]
  );

  /* ---- Stable blob URLs for image previews ---- */
  const previewUrls = useMemo(
    () =>
      extractedImages.map((img) =>
        URL.createObjectURL(
          new Blob([img.pngData as BlobPart], { type: "image/png" })
        )
      ),
    [extractedImages]
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

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
        <ExtractIcon className="!h-4 !w-4" />
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
        <div className="w-full max-w-2xl">
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

          {/* Extracting spinner */}
          {isExtracting && (
            <div className="mt-6 flex items-center justify-center gap-2 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">{t("extracting")}</p>
            </div>
          )}

          {/* No images found message */}
          {noImagesFound && (
            <div className="mt-6 rounded-xl border border-red-400/50 bg-red-500/5 p-4 text-center">
              <p className="text-sm text-red-500">{t("noImagesFound")}</p>
            </div>
          )}

          {/* Image previews grid */}
          {extractedImages.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("imagesFound", { count: extractedImages.length })}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {extractedImages.map((img, i) => (
                  <div
                    key={`p${img.pageIndex}_i${img.imageIndex}`}
                    className="group/card flex aspect-square flex-col overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(i)}
                      className="flex min-h-0 flex-1 cursor-zoom-in items-center justify-center overflow-hidden bg-accent/50 p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrls[i]}
                        alt={t("imageAlt", {
                          page: img.pageIndex + 1,
                          index: img.imageIndex + 1,
                        })}
                        className="pointer-events-none max-h-full max-w-full object-contain"
                      />
                    </button>
                    <div className="flex shrink-0 items-center justify-between px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        {img.width}&times;{img.height}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadOne(img)}
                        className="flex items-center rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        title={t("downloadImage")}
                      >
                        <DownloadIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      {extractedImages.length > 0 && (
        <footer className="border-t border-border bg-card px-6 py-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t("imagesFound", { count: extractedImages.length })}
            </div>
            <button
              type="button"
              onClick={handleDownloadAll}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-all hover:shadow-lg"
            >
              <DownloadIcon />
              {t("downloadAll")}
            </button>
          </div>
        </footer>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm text-white/70">
                {extractedImages[lightboxIndex].width}&times;
                {extractedImages[lightboxIndex].height}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadOne(extractedImages[lightboxIndex])}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <DownloadIcon />
                {t("downloadImage")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="cursor-zoom-out"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrls[lightboxIndex]}
                alt={t("imageAlt", {
                  page: extractedImages[lightboxIndex].pageIndex + 1,
                  index: extractedImages[lightboxIndex].imageIndex + 1,
                })}
                className="pointer-events-none max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
