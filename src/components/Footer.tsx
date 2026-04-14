"use client";

import { useTranslations } from "next-intl";
import { CodebergIcon } from "./Icons";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border px-6 py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <span>
          © {year}{" "}
          <a
            href="https://no.linkedin.com/in/aleksander-helgaker"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Aleksander Helgaker
          </a>
        </span>
        <a
          href="https://codeberg.org/alehel/hermitpdf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-colors hover:text-foreground"
        >
          <CodebergIcon className="h-7 w-7" />
          <div className="flex flex-col text-xs">
            <span>{t("openSource")}</span>
            <span>AGPL-3.0</span>
          </div>
        </a>
      </div>
    </footer>
  );
}
