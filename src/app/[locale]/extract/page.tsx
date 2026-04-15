import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { ExtractWizard } from "./ExtractWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "extractImagesWizard" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: "Extract all embedded images from a PDF file. Free, private, and runs entirely in your browser.",
  };
}

export default async function ExtractPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <ExtractWizard />
    </div>
  );
}
