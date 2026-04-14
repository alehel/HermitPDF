"use client";

import { useTranslations } from "next-intl";

interface DismissibleBannerProps {
  messageKey: string;
  files?: string[];
  onDismiss: () => void;
}

export function DismissibleBanner({
  messageKey,
  files,
  onDismiss,
}: DismissibleBannerProps) {
  const t = useTranslations("documentPanel");

  return (
    <div className="flex items-center justify-between bg-accent px-4 py-2">
      <p className="text-xs text-foreground">
        {files ? t(messageKey, { files: files.join(", ") }) : t(messageKey)}
      </p>
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
