"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar() {
  const t = useTranslations("topbar");

  return (
    <header className="flex shrink-0 items-center gap-3 bg-sidebar px-6 py-4">
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground/90"
        aria-label="Home"
      >
        <ArrowLeftIcon />
      </Link>
      <Link href="/">
        <Image
          src="/hermitpdf-full-dark.svg"
          alt="HermitPDF"
          width={160}
          height={23}
          priority
        />
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground/90 hover:bg-sidebar-hover"
          title={t("toggleDarkMode")}
        />
      </div>
    </header>
  );
}
