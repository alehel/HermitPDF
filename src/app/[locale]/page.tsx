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
  WorkbenchIcon,
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
        </div>

        {/* Divider */}
        <div className="mb-10 flex w-full max-w-2xl items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Workbench CTA */}
        <p className="mb-4 hidden text-sm text-muted-foreground sm:block">{t("workbenchHint")}</p>
        <Link
          href="/workbench"
          className="group flex w-full max-w-2xl items-center gap-4 rounded-2xl bg-sidebar p-4 text-left transition-all hover:shadow-xl sm:gap-6 sm:p-6"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-14 sm:w-14">
            <WorkbenchIcon />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-medium text-white sm:text-lg">
              {t("workbench")}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t("workbenchDesc")}</p>
          </div>
          <ArrowRightIcon size={20} className="text-white/40 transition-transform group-hover:translate-x-1" />
        </Link>
      </main>

      <Footer />
    </div>
  );
}
