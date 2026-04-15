"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import { ArrowLeftIcon } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

interface AppHeaderProps {
  showBack?: boolean;
}

export function AppHeader({ showBack = true }: AppHeaderProps) {
  const t = useTranslations("common");
  const { theme } = useTheme();

  const logoSrc =
    theme === "dark" ? "/hermitpdf-full-dark.svg" : "/hermitpdf-full.svg";

  return (
    <header
      className={`flex items-center gap-3 px-6 py-4 ${showBack ? "border-b border-border" : ""}`}
    >
      {showBack && (
        <Link
          href="/"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
          title={t("back")}
        >
          <ArrowLeftIcon />
        </Link>
      )}
      {showBack ? (
        <Link href="/">
          <Image
            src={logoSrc}
            alt="HermitPDF"
            width={160}
            height={23}
          />
        </Link>
      ) : (
        <Image
          src={logoSrc}
          alt="HermitPDF"
          width={160}
          height={23}
          priority
        />
      )}
      <div className="ml-auto">
        <ThemeToggle title={t("toggleTheme")} />
      </div>
    </header>
  );
}
