"use client";

import { useTranslations } from "next-intl";
import { CodebergIcon } from "./Icons";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border px-6 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <span>
            {t("copyright", { year })}{" "}
            <a
              href="https://no.linkedin.com/in/aleksander-helgaker"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              Aleksander Helgaker
            </a>
          </span>
          <span>{t("builtIn")}</span>
        </div>
        <a
          href="https://codeberg.org/alehel/hermitpdf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 transition-colors hover:text-foreground"
        >
          <CodebergIcon className="h-7 w-7" />
          <span className="text-xs">{t("sourceCode")}</span>
        </a>
      </div>
    </footer>
  );
}
