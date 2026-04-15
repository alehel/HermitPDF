import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { SplitWizard } from "./SplitWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "splitWizard" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: "Split a PDF into multiple files by page ranges. Free, private, and runs entirely in your browser.",
  };
}

export default async function SplitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <SplitWizard />
    </div>
  );
}
