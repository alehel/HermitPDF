import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AppHeader } from "@/components/AppHeader";
import {
  MergeIcon,
  CollateIcon,
  ScissorsIcon,
  ExtractIcon,
  BatesIcon,
  RotateIcon,
  LockIcon,
  UnlockIcon,
  CompressIcon,
  ContrastIcon,
  AttachIcon,
  LinkIcon,
  BookIcon,
  ArrowRightIcon,
} from "@/components/Icons";
import { QuickActionCard } from "@/components/QuickActionCard";
import { Footer } from "@/components/Footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "homeScreen" });
  return {
    title: "HermitPDF — " + t("tagline"),
    description: t("tagline"),
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("homeScreen");

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, var(--accent), var(--background) 70%)",
      }}
    >
      <AppHeader showBack={false} />

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
        <div className="mb-4 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("quickActions")}
          </p>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{t("quickActionsHint")}</p>
        </div>
        <div className="mb-10 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickActionCard href="/merge" icon={<MergeIcon />} title={t("merge")} description={t("mergeDesc")} />
          <QuickActionCard href="/collate" icon={<CollateIcon />} title={t("collate")} description={t("collateDesc")} />
          <QuickActionCard href="/split" icon={<ScissorsIcon />} title={t("split")} description={t("splitDesc")} />
          <QuickActionCard href="/rotate" icon={<RotateIcon />} title={t("rotate")} description={t("rotateDesc")} />
          <QuickActionCard href="/extract" icon={<ExtractIcon />} title={t("extractImages")} description={t("extractImagesDesc")} />
          <QuickActionCard href="/bates" icon={<BatesIcon />} title={t("bates")} description={t("batesDesc")} />
          <QuickActionCard href="/protect" icon={<LockIcon />} title={t("protect")} description={t("protectDesc")} />
          <QuickActionCard href="/unlock" icon={<UnlockIcon />} title={t("unlock")} description={t("unlockDesc")} />
          <QuickActionCard href="/compress" icon={<CompressIcon />} title={t("compress")} description={t("compressDesc")} />
          <QuickActionCard href="/contrast" icon={<ContrastIcon />} title={t("contrast")} description={t("contrastDesc")} />
          <QuickActionCard href="/attach" icon={<AttachIcon />} title={t("attach")} description={t("attachDesc")} />
          <QuickActionCard href="/links" icon={<LinkIcon />} title={t("links")} description={t("linksDesc")} />
          <QuickActionCard href="/bookscan" icon={<BookIcon />} title={t("bookScan")} description={t("bookScanDesc")} />
        </div>

        {/* Divider */}
        <div className="mb-10 flex w-full max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* PdfCraft CTA — in PdfCraft's own red (its app colour, #b70228),
            with its lion icon as a backdrop on the left, masked so the icon
            tile's square edges fade into the gradient. */}
        <p className="mb-4 hidden text-sm text-muted-foreground sm:block">{t("pdfcraftHint")}</p>
        <Link
          href="/workbench"
          className="group relative flex w-full max-w-2xl items-center gap-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#b70228] to-[#6e0118] p-5 pl-24 text-left text-white transition-shadow hover:shadow-xl sm:p-7 sm:pl-36"
        >
          <Image
            src="/pdfcraft-icon.png"
            alt=""
            width={192}
            height={192}
            className="pointer-events-none absolute -bottom-6 -left-8 w-32 rotate-[8deg] opacity-20 mix-blend-luminosity [mask-image:radial-gradient(closest-side,black_60%,transparent)] transition-transform duration-500 group-hover:scale-105 sm:-bottom-12 sm:-left-10 sm:w-48"
          />
          <div className="relative min-w-0 flex-1">
            <h2 className="text-lg font-medium sm:text-xl">{t("pdfcraft")}</h2>
            <p className="mt-1 max-w-md text-sm text-white/80">{t("pdfcraftDesc")}</p>
          </div>
          <span className="relative hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#8a011e] sm:flex">
            {t("pdfcraftLaunch")}
            <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
          </span>
          <ArrowRightIcon size={20} className="relative shrink-0 text-white/70 sm:hidden" />
        </Link>
      </main>

      <Footer />
    </div>
  );
}
