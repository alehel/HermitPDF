"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UnlockIcon, EyeIcon, EyeOffIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { authenticatePassword, decryptPdf, getPageCount } from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

function unlockedStem(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_unlocked.pdf";
}

export function UnlockWizard() {
  const t = useTranslations("unlockWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
  } = usePdfIngestion({ allowProtected: true });

  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, pdfCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      setFile((prev) => {
        if (prev) releaseWizardFile(prev);
        return newFile;
      });
      setPassword("");
      setAuthError(false);
      setIsAuthenticated(false);

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
    setAuthError(false);
    setIsAuthenticated(false);
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!file || !file.needsPassword || !password) return;
    setIsAuthenticating(true);
    setAuthError(false);
    try {
      const ok = await authenticatePassword(file.sourceDocId, password);
      if (!ok) {
        setAuthError(true);
        return;
      }
      // Re-fetch the page count now that the document is readable
      const count = await getPageCount(file.sourceDocId);
      setFile((prev) =>
        prev
          ? {
              ...prev,
              pageCount: count,
            }
          : prev
      );
      setIsAuthenticated(true);
    } finally {
      setIsAuthenticating(false);
    }
  }, [file, password]);

  const handleExport = useCallback(async () => {
    if (!file || !isAuthenticated) return;
    setIsExporting(true);
    try {
      const data = await decryptPdf(file.sourceDocId);
      downloadPdf(data, unlockedStem(file.name));
    } finally {
      setIsExporting(false);
    }
  }, [file, isAuthenticated]);

  const isUnprotected = !!file && !file.needsPassword;

  const footerProps = !file
    ? undefined
    : isUnprotected
      ? undefined
      : isAuthenticated
        ? {
            statusText: t("statusReady"),
            buttonLabel: isExporting ? t("unlocking") : t("downloadUnlocked"),
            onButtonClick: handleExport,
            disabled: isExporting,
          }
        : {
            statusText: authError ? t("statusWrongPassword") : t("statusEnterPassword"),
            buttonLabel: isAuthenticating ? t("checking") : t("unlock"),
            onButtonClick: handleAuthenticate,
            disabled: !password || isAuthenticating,
          };

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
        icon={<UnlockIcon className="!h-5 !w-5" />}
        title={t("title")}
        empty={!file}
        footer={footerProps}
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
              subtitle={
                isAuthenticated
                  ? `${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`
                  : isUnprotected
                    ? `${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`
                    : `${t("encrypted")} \u00b7 ${formatSize(file.fileSize)}`
              }
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            {isUnprotected ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                {t("notEncrypted")}
              </div>
            ) : isAuthenticated ? (
              <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-foreground">
                {t("authenticatedNote")}
              </div>
            ) : (
              <div className="mt-6">
                <label htmlFor="unlock-password" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <input
                    id="unlock-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authError) setAuthError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password && !isAuthenticating) {
                        e.preventDefault();
                        handleAuthenticate();
                      }
                    }}
                    autoComplete="current-password"
                    className={`w-full rounded-xl border bg-card px-4 py-2.5 pr-10 text-sm text-foreground outline-none ${
                      authError ? "border-red-500 focus:border-red-500" : "border-border focus:border-primary"
                    }`}
                    placeholder={t("passwordPlaceholder")}
                    autoFocus
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
                {authError && (
                  <p className="mt-1.5 text-xs text-red-500">{t("wrongPassword")}</p>
                )}
              </div>
            )}
          </>
        )}
      </WizardContainer>
    </>
  );
}
