"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LockIcon, EyeIcon, EyeOffIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { encryptPdf } from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

function protectedStem(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_protected.pdf";
}

export function ProtectWizard() {
  const t = useTranslations("protectWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
  } = usePdfIngestion();

  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, pdfCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      setFile((prev) => {
        if (prev) releaseWizardFile(prev);
        return newFile;
      });

      if (pdfCount > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      }
    },
    [ingestFiles, setRejectedFiles, t]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded);

  useEffect(() => {
    return () => {
      const f = fileRef.current;
      if (f) releaseWizardFile(f);
    };
  }, []);

  const handleRemove = useCallback(() => {
    setFile((prev) => {
      if (prev) releaseWizardFile(prev);
      return null;
    });
    setPassword("");
    setConfirm("");
  }, []);

  const passwordsMatch = password.length > 0 && password === confirm;
  const showMismatch = confirm.length > 0 && password !== confirm;

  const handleExport = useCallback(async () => {
    if (!file || !passwordsMatch) return;
    setIsExporting(true);
    try {
      const sourceDocId = file.stack.pages[0]?.sourceDocId;
      if (!sourceDocId) return;
      const data = await encryptPdf(sourceDocId, password);
      downloadPdf(data, protectedStem(file.name));
    } finally {
      setIsExporting(false);
    }
  }, [file, password, passwordsMatch]);

  const statusText = !password
    ? t("statusEnterPassword")
    : showMismatch
      ? t("statusMismatch")
      : t("statusReady");

  return (
    <>
      {fileInput}

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
      />

      <WizardContainer
        icon={<LockIcon className="!h-5 !w-5" />}
        title={t("title")}
        empty={!file}
        footer={file ? {
          statusText,
          buttonLabel: isExporting ? t("protecting") : t("protectAndDownload"),
          onButtonClick: handleExport,
          disabled: isExporting || !passwordsMatch,
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
          />
        ) : (
          <>
            <FileCard
              name={file.name}
              subtitle={`${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`}
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="protect-password" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <input
                    id="protect-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm text-foreground outline-none focus:border-primary"
                    placeholder={t("passwordPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                    title={showPassword ? t("hidePassword") : t("showPassword")}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="protect-confirm" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("confirmLabel")}
                </label>
                <input
                  id="protect-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full rounded-xl border bg-card px-4 py-2.5 text-sm text-foreground outline-none ${
                    showMismatch ? "border-red-500 focus:border-red-500" : "border-border focus:border-primary"
                  }`}
                />
                {showMismatch && (
                  <p className="mt-1.5 text-xs text-red-500">{t("mismatch")}</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{t("encryptionNote")}</p>
            </div>
          </>
        )}
      </WizardContainer>
    </>
  );
}
