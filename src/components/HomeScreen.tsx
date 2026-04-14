"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "./ThemeProvider";
import {
  MoonIcon,
  SunIcon,
  MergeIcon,
  ScissorsIcon,
  ExtractIcon,
  WorkbenchIcon,
  ArrowRightIcon,
} from "./Icons";
import { Footer } from "./Footer";

function ThemeToggle() {
  const t = useTranslations("homeScreen");
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
      title={t("toggleTheme")}
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

export function HomeScreen() {
  const t = useTranslations("homeScreen");
  const { theme } = useTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Image
          src={theme === "dark" ? "/hermitpdf-full-dark.svg" : "/hermitpdf-full.svg"}
          alt="HermitPDF"
          width={160}
          height={23}
          priority
        />
        <ThemeToggle />
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        {/* Hero */}
        <div className="mb-12 text-center">
          <Image
            src="/hermitpdf-icon.svg"
            alt=""
            width={48}
            height={48}
            className="mx-auto mb-4"
          />
          <h1 className="text-3xl font-medium text-foreground">{t("welcome")}</h1>
          <p className="mt-2 text-muted-foreground">{t("tagline")}</p>
        </div>

        {/* Quick actions */}
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("quickActions")}
        </p>
        <div className="mb-10 flex w-full max-w-2xl gap-3">
          {/* Merge — linked */}
          <Link
            href="/merge"
            className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 transition-all hover:border-primary hover:shadow-md"
          >
            <div className="text-muted-foreground transition-colors group-hover:text-primary">
              <MergeIcon />
            </div>
            <span className="text-sm font-medium text-foreground">
              {t("merge")}
            </span>
            <span className="text-xs text-muted-foreground">{t("mergeDesc")}</span>
          </Link>

          {/* Split — linked */}
          <Link
            href="/split"
            className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 transition-all hover:border-primary hover:shadow-md"
          >
            <div className="text-muted-foreground transition-colors group-hover:text-primary">
              <ScissorsIcon />
            </div>
            <span className="text-sm font-medium text-foreground">
              {t("split")}
            </span>
            <span className="text-xs text-muted-foreground">{t("splitDesc")}</span>
          </Link>

          {/* Extract Images — linked */}
          <Link
            href="/extract"
            className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 transition-all hover:border-primary hover:shadow-md"
          >
            <div className="text-muted-foreground transition-colors group-hover:text-primary">
              <ExtractIcon />
            </div>
            <span className="text-sm font-medium text-foreground">
              {t("extractImages")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("extractImagesDesc")}
            </span>
          </Link>
        </div>

        {/* Divider */}
        <div className="mb-10 flex w-full max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Workbench CTA */}
        <Link
          href="/workbench"
          className="group flex w-full max-w-2xl items-center gap-6 rounded-2xl bg-sidebar p-6 text-left transition-all hover:shadow-xl"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <WorkbenchIcon />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white">
              {t("openWorkbench")}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t("workbenchDesc")}</p>
          </div>
          <ArrowRightIcon className="h-5 w-5 text-white/40 transition-transform group-hover:translate-x-1" />
        </Link>
      </main>

      <Footer />
    </div>
  );
}
