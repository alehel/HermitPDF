import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { BatesWizard } from "./BatesWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "batesWizard" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: "Add Bates numbering to PDF documents. Free, private, and runs entirely in your browser.",
  };
}

export default async function BatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <BatesWizard />
    </div>
  );
}
