"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import { MoonIcon, SunIcon, ArrowLeftIcon } from "./Icons";

export function WizardHeader() {
  const t = useTranslations("common");
  const { theme, toggleTheme } = useTheme();

  return (
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
          title={t("toggleTheme")}
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  );
}
