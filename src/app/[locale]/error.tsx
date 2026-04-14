"use client";

import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
      <h2 className="text-lg font-medium text-foreground">{t("title")}</h2>
      <p className="max-w-[400px] text-center text-sm text-muted-foreground">
        {error.message || t("defaultMessage")}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
