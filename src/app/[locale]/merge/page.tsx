import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { MergeWizard } from "./MergeWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mergeWizard" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: "Merge multiple PDF files into one document. Free, private, and runs entirely in your browser.",
  };
}

export default async function MergePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <MergeWizard />
    </div>
  );
}
