"use client";

import { useState } from "react";
import Image from "next/image";
import { useTheme } from "./ThemeProvider";
import { MoonIcon, SunIcon } from "./Icons";

/* ------------------------------------------------------------------ */
/*  Shared icons for the express modes                                 */
/* ------------------------------------------------------------------ */

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6H3v14h5" />
      <path d="M16 6h5v14h-5" />
      <path d="M12 3v18" />
    </svg>
  );
}

function ScissorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

function ExtractIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function WorkbenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function FileDocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function UploadCloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PlusCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme toggle                                                       */
/* ------------------------------------------------------------------ */

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-lg p-2 text-pw-muted transition-colors hover:bg-pw-border hover:text-pw-text"
      title="Toggle theme"
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

/* ================================================================== */
/*  MOCKUP A — Card Grid                                               */
/* ================================================================== */

function MockupA({ onSelect }: { onSelect: (mode: string) => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-pw-bg">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <Image src="/hermitpdf-full.svg" alt="HermitPDF" width={160} height={23} className="dark:hidden" />
        <Image src="/hermitpdf-full-dark.svg" alt="HermitPDF" width={160} height={23} className="hidden dark:block" />
        <ThemeToggle />
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <h1 className="mb-2 text-2xl font-medium text-pw-text">
          What would you like to do?
        </h1>
        <p className="mb-10 text-sm text-pw-muted">
          Choose a quick action or open the full workbench.
        </p>

        {/* Card grid */}
        <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
          {/* Merge */}
          <button
            type="button"
            onClick={() => onSelect("merge")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-pw-border bg-pw-panel p-6 text-left transition-all hover:border-pw-accent hover:shadow-lg"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pw-accent-light text-pw-accent">
              <MergeIcon />
            </div>
            <div>
              <h2 className="font-medium text-pw-text">Merge PDFs</h2>
              <p className="mt-1 text-sm text-pw-muted">
                Combine multiple files into a single PDF.
              </p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-pw-accent opacity-0 transition-opacity group-hover:opacity-100">
              Start <ArrowRightIcon className="h-3 w-3" />
            </span>
          </button>

          {/* Split */}
          <button
            type="button"
            onClick={() => onSelect("split")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-pw-border bg-pw-panel p-6 text-left transition-all hover:border-pw-accent hover:shadow-lg"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pw-accent-light text-pw-accent">
              <ScissorsIcon />
            </div>
            <div>
              <h2 className="font-medium text-pw-text">Split PDF</h2>
              <p className="mt-1 text-sm text-pw-muted">
                Break a PDF into separate files by page range.
              </p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-pw-accent opacity-0 transition-opacity group-hover:opacity-100">
              Start <ArrowRightIcon className="h-3 w-3" />
            </span>
          </button>

          {/* Extract Images */}
          <button
            type="button"
            onClick={() => onSelect("extract")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-pw-border bg-pw-panel p-6 text-left transition-all hover:border-pw-accent hover:shadow-lg"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pw-accent-light text-pw-accent">
              <ExtractIcon />
            </div>
            <div>
              <h2 className="font-medium text-pw-text">Extract Images</h2>
              <p className="mt-1 text-sm text-pw-muted">
                Pull all images from a PDF as a ZIP download.
              </p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-pw-accent opacity-0 transition-opacity group-hover:opacity-100">
              Start <ArrowRightIcon className="h-3 w-3" />
            </span>
          </button>

          {/* Workbench */}
          <button
            type="button"
            onClick={() => onSelect("workbench")}
            className="group flex flex-col items-start gap-3 rounded-xl border-2 border-pw-accent bg-pw-panel p-6 text-left transition-all hover:shadow-lg"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pw-accent text-white">
              <WorkbenchIcon />
            </div>
            <div>
              <h2 className="font-medium text-pw-text">Workbench</h2>
              <p className="mt-1 text-sm text-pw-muted">
                Full editor for advanced page manipulation.
              </p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-pw-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open <ArrowRightIcon className="h-3 w-3" />
            </span>
          </button>
        </div>
      </main>
    </div>
  );
}

/* ================================================================== */
/*  MOCKUP B — Horizontal express row + prominent workbench            */
/* ================================================================== */

function MockupB({ onSelect }: { onSelect: (mode: string) => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-pw-bg">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <Image src="/hermitpdf-full.svg" alt="HermitPDF" width={160} height={23} className="dark:hidden" />
        <Image src="/hermitpdf-full-dark.svg" alt="HermitPDF" width={160} height={23} className="hidden dark:block" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        {/* Hero */}
        <div className="mb-12 text-center">
          <Image src="/hermitpdf-icon.svg" alt="" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-3xl font-medium text-pw-text">
            Welcome to HermitPDF
          </h1>
          <p className="mt-2 text-pw-muted">
            Privacy-first PDF toolkit. Everything runs in your browser.
          </p>
        </div>

        {/* Express section */}
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-pw-muted">
          Quick Actions
        </p>
        <div className="mb-10 flex w-full max-w-2xl gap-3">
          {[
            { id: "merge", icon: <MergeIcon />, label: "Merge", desc: "Combine files" },
            { id: "split", icon: <ScissorsIcon />, label: "Split", desc: "Separate pages" },
            { id: "extract", icon: <ExtractIcon />, label: "Extract Images", desc: "Download as ZIP" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-pw-border bg-pw-panel px-4 py-6 transition-all hover:border-pw-accent hover:shadow-md"
            >
              <div className="text-pw-muted transition-colors group-hover:text-pw-accent">
                {item.icon}
              </div>
              <span className="text-sm font-medium text-pw-text">{item.label}</span>
              <span className="text-xs text-pw-muted">{item.desc}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="mb-10 flex w-full max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-pw-border" />
          <span className="text-xs text-pw-muted">or</span>
          <div className="h-px flex-1 bg-pw-border" />
        </div>

        {/* Workbench CTA */}
        <button
          type="button"
          onClick={() => onSelect("workbench")}
          className="group flex w-full max-w-2xl items-center gap-6 rounded-2xl bg-pw-sidebar p-6 text-left transition-all hover:shadow-xl"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-pw-accent text-white">
            <WorkbenchIcon />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white">
              Open Workbench
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Full editor with drag-and-drop page management, reordering, rotation, and multi-file export.
            </p>
          </div>
          <ArrowRightIcon className="h-5 w-5 text-white/40 transition-transform group-hover:translate-x-1" />
        </button>
      </main>
    </div>
  );
}

/* ================================================================== */
/*  MOCKUP C — Compact centered list                                   */
/* ================================================================== */

function MockupC({ onSelect }: { onSelect: (mode: string) => void }) {
  const items = [
    {
      id: "merge",
      icon: <MergeIcon />,
      label: "Merge PDFs",
      desc: "Combine multiple files into one",
      color: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
    },
    {
      id: "split",
      icon: <ScissorsIcon />,
      label: "Split PDF",
      desc: "Separate a PDF by page ranges",
      color: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    },
    {
      id: "extract",
      icon: <ExtractIcon />,
      label: "Extract Images",
      desc: "Download all images as a ZIP",
      color: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-pw-bg">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <Image src="/hermitpdf-full.svg" alt="HermitPDF" width={160} height={23} className="dark:hidden" />
        <Image src="/hermitpdf-full-dark.svg" alt="HermitPDF" width={160} height={23} className="hidden dark:block" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-center text-2xl font-medium text-pw-text">
            Get started
          </h1>
          <p className="mb-8 text-center text-sm text-pw-muted">
            Pick a quick action or use the full workbench.
          </p>

          {/* Express items as a stacked list */}
          <div className="mb-6 space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="group flex w-full items-center gap-4 rounded-xl border border-pw-border bg-pw-panel p-4 text-left transition-all hover:border-pw-accent hover:shadow-md"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                  {item.icon}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-pw-text">{item.label}</span>
                  <p className="text-xs text-pw-muted">{item.desc}</p>
                </div>
                <ArrowRightIcon className="h-4 w-4 text-pw-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            ))}
          </div>

          {/* Workbench button */}
          <button
            type="button"
            onClick={() => onSelect("workbench")}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-pw-accent px-6 py-4 font-medium text-white transition-all hover:shadow-lg"
          >
            <WorkbenchIcon className="h-5 w-5" />
            <span>Open Workbench</span>
            <ArrowRightIcon className="h-4 w-4 opacity-60 transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="mt-3 text-center text-xs text-pw-muted">
            Advanced editor with full page management
          </p>
        </div>
      </main>
    </div>
  );
}

/* ================================================================== */
/*  MERGE WIZARD — Express merge flow                                  */
/* ================================================================== */

const sampleFiles = [
  { name: "Q1-Financial-Report.pdf", pages: 24, size: "2.4 MB" },
  { name: "Cover-Letter.pdf", pages: 1, size: "84 KB" },
  { name: "Appendix-Charts.pdf", pages: 12, size: "5.1 MB" },
];

function MergeWizardEmpty({ onBack, onAddFiles }: { onBack: () => void; onAddFiles: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-pw-bg">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-pw-border px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-pw-muted transition-colors hover:bg-pw-border hover:text-pw-text"
        >
          <ArrowLeftIcon />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pw-accent-light text-pw-accent">
            <MergeIcon className="!h-4 !w-4" />
          </div>
          <h1 className="text-lg font-medium text-pw-text">Merge PDFs</h1>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      {/* Drop zone */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <button
          type="button"
          onClick={onAddFiles}
          className="group flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-pw-border bg-pw-panel/50 px-8 py-16 transition-all hover:border-pw-accent hover:bg-pw-accent-light/30"
        >
          <UploadCloudIcon className="text-pw-muted transition-colors group-hover:text-pw-accent" />
          <div className="text-center">
            <p className="font-medium text-pw-text">
              Drop PDF files here
            </p>
            <p className="mt-1 text-sm text-pw-muted">
              or click to browse
            </p>
          </div>
        </button>
        <p className="mt-4 text-xs text-pw-muted">
          Files are processed entirely in your browser. Nothing is uploaded.
        </p>
      </main>
    </div>
  );
}

function MergeWizardPopulated({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-pw-bg">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-pw-border px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-pw-muted transition-colors hover:bg-pw-border hover:text-pw-text"
        >
          <ArrowLeftIcon />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pw-accent-light text-pw-accent">
            <MergeIcon className="!h-4 !w-4" />
          </div>
          <h1 className="text-lg font-medium text-pw-text">Merge PDFs</h1>
        </div>
        <span className="rounded-full bg-pw-accent-light px-2 py-0.5 text-xs font-medium text-pw-accent">
          {sampleFiles.length} files
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      {/* File list */}
      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <div className="w-full max-w-xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-pw-muted">
            Drag to reorder
          </p>

          <div className="space-y-2">
            {sampleFiles.map((file, i) => (
              <div
                key={file.name}
                className="group flex items-center gap-3 rounded-xl border border-pw-border bg-pw-panel p-4 transition-all hover:border-pw-accent/40 hover:shadow-sm"
              >
                {/* Drag handle */}
                <div className="cursor-grab text-pw-muted/50 transition-colors hover:text-pw-muted active:cursor-grabbing">
                  <GripIcon />
                </div>

                {/* Order badge */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pw-accent-light text-xs font-medium text-pw-accent">
                  {i + 1}
                </span>

                {/* File icon */}
                <div className="text-pw-accent">
                  <FileDocIcon />
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-pw-text">
                    {file.name}
                  </p>
                  <p className="text-xs text-pw-muted">
                    {file.pages} {file.pages === 1 ? "page" : "pages"} &middot; {file.size}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-pw-muted opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          {/* Add more files */}
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-pw-border bg-pw-panel/50 py-3 text-sm text-pw-muted transition-all hover:border-pw-accent hover:text-pw-accent"
          >
            <PlusCircleIcon />
            Add more files
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-pw-border bg-pw-panel px-6 py-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="text-sm text-pw-muted">
            <span className="font-medium text-pw-text">{sampleFiles.reduce((s, f) => s + f.pages, 0)} pages</span> total
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-pw-accent px-6 py-3 font-medium text-white transition-all hover:shadow-lg"
          >
            <DownloadIcon />
            Merge &amp; Download
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================== */
/*  Mockup Switcher — wraps all mockups for preview                    */
/* ================================================================== */

type MockupId = "home-A" | "home-B" | "home-C" | "merge-empty" | "merge-populated";

const homeMockups = [
  { id: "home-A" as const, label: "Home: Card Grid", component: MockupA },
  { id: "home-B" as const, label: "Home: Hero", component: MockupB },
  { id: "home-C" as const, label: "Home: Compact", component: MockupC },
];

export function HomeScreenMockups() {
  const [active, setActive] = useState<MockupId>("home-B");

  /* Render merge wizard states */
  if (active === "merge-empty") {
    return (
      <WithSwitcher active={active} setActive={setActive}>
        <MergeWizardEmpty onBack={() => setActive("home-B")} onAddFiles={() => setActive("merge-populated")} />
      </WithSwitcher>
    );
  }

  if (active === "merge-populated") {
    return (
      <WithSwitcher active={active} setActive={setActive}>
        <MergeWizardPopulated onBack={() => setActive("home-B")} />
      </WithSwitcher>
    );
  }

  /* Render home screen mockups */
  const ActiveHome = homeMockups.find((m) => m.id === active)!.component;
  return (
    <WithSwitcher active={active} setActive={setActive}>
      <ActiveHome onSelect={(mode) => {
        if (mode === "merge") setActive("merge-empty");
      }} />
    </WithSwitcher>
  );
}

function WithSwitcher({
  active,
  setActive,
  children,
}: {
  active: MockupId;
  setActive: (id: MockupId) => void;
  children: React.ReactNode;
}) {
  const all: { id: MockupId; label: string }[] = [
    { id: "home-A", label: "Home A" },
    { id: "home-B", label: "Home B" },
    { id: "home-C", label: "Home C" },
    { id: "merge-empty", label: "Merge: Empty" },
    { id: "merge-populated", label: "Merge: Files" },
  ];

  return (
    <div className="relative">
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-pw-border bg-pw-panel px-2 py-1.5 shadow-xl">
        <span className="pl-2 pr-1 text-xs font-medium text-pw-muted">Mockup:</span>
        {all.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActive(m.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active === m.id
                ? "bg-pw-accent text-white"
                : "text-pw-muted hover:bg-pw-border hover:text-pw-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
