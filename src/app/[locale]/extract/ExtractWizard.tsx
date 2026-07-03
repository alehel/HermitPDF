"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExtractIcon, DownloadIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { WizardFile, ExtractedImage } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { extractImagesFromDocument } from "@/lib/mupdfClient";
import {
  buildExtractedImageFilename,
  downloadImages,
  downloadSingleImage,
  pdfNameStem,
} from "@/lib/imageExport";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";
import { BlobImage } from "@/components/BlobImage";

export function ExtractWizard() {
  const t = useTranslations("extractImagesWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [noImagesFound, setNoImagesFound] = useState(false);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
  } = usePdfIngestion();

  /* ---- Extract images (auto-triggered on file load) ---- */
  const handleExtract = useCallback(async (f: WizardFile) => {
    setIsExtracting(true);
    setNoImagesFound(false);
    setExtractedImages([]);
    setLightboxIndex(null);
    try {
      const images = await extractImagesFromDocument(f.sourceDocId);
      // If the user removed (or replaced) this file while the extract was
      // running, discard the result.
      if (fileRef.current?.id !== f.id) return;
      if (images.length === 0) {
        setNoImagesFound(true);
      } else {
        setExtractedImages(images);
      }
    } catch (err) {
      // Don't let a rejection here become an unhandled promise rejection (which
      // surfaces as a dev error overlay and breaks the wizard). If this file is
      // already gone, the error is expected — the worker handle was destroyed.
      if (fileRef.current?.id === f.id) {
        console.error("Image extraction failed:", err);
      }
    } finally {
      if (fileRef.current?.id === f.id) {
        setIsExtracting(false);
      }
    }
  }, []);

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, fileCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      // Side effect outside the updater: Strict Mode double-invokes updaters,
      // which would release the previous file twice and race in OPFS.
      const prev = fileRef.current;
      if (prev) releaseWizardFile(prev);
      setFile(newFile);
      setNoImagesFound(false);
      handleExtract(newFile);

      if (fileCount > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      }
    },
    [ingestFiles, setRejectedFiles, handleExtract, t]
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
    const prev = fileRef.current;
    if (prev) releaseWizardFile(prev);
    setFile(null);
    setNoImagesFound(false);
    setExtractedImages([]);
    setLightboxIndex(null);
  }, []);

  /* ---- Download all images ---- */
  const handleDownloadAll = useCallback(() => {
    if (!file || extractedImages.length === 0) return;
    downloadImages(extractedImages, file.name);
  }, [file, extractedImages]);

  /* ---- Download a single image ---- */
  const handleDownloadOne = useCallback(
    (img: ExtractedImage) => {
      if (!file) return;
      downloadSingleImage(
        img.data,
        buildExtractedImageFilename(pdfNameStem(file.name), img),
        img.mimeType
      );
    },
    [file]
  );

  // Deref once so the lightbox can't crash if the index ever outlives the
  // images array; render nothing instead.
  const lightboxImage =
    lightboxIndex !== null ? extractedImages[lightboxIndex] : undefined;

  return (
    <>
      {fileInput}

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        oversizedMessage={oversizedFiles.length > 0 ? t("oversizedFiles", { files: oversizedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
        onDismissOversized={() => setOversizedFiles([])}
      />

      <WizardContainer
        icon={<ExtractIcon size={20} />}
        title={t("title")}
        empty={!file}
        footer={extractedImages.length > 0 ? {
          statusText: t("imagesFound", { count: extractedImages.length }),
          buttonLabel: t("downloadAll"),
          onButtonClick: handleDownloadAll,
        } : undefined}
      >
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {t("formatNote")}
        </p>

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

            {isExtracting && (
              <div className="mt-6 flex items-center justify-center gap-2 py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">{t("extracting")}</p>
              </div>
            )}

            {noImagesFound && (
              <div className="mt-6 rounded-xl border border-red-400/50 bg-red-500/5 p-4 text-center">
                <p className="text-sm text-red-500">{t("noImagesFound")}</p>
              </div>
            )}

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
                        <BlobImage
                          data={img.data}
                          mimeType={img.mimeType}
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
          </>
        )}
      </WizardContainer>

      {lightboxIndex !== null && lightboxImage && (
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
                {lightboxImage.width}&times;{lightboxImage.height}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadOne(lightboxImage)}
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
              <BlobImage
                data={lightboxImage.data}
                mimeType={lightboxImage.mimeType}
                alt={t("imageAlt", {
                  page: lightboxImage.pageIndex + 1,
                  index: lightboxImage.imageIndex + 1,
                })}
                className="pointer-events-none max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
