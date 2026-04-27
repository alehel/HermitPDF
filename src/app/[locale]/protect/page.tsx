import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { ProtectWizard } from "./ProtectWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "protectWizard" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: t("metaDescription"),
  };
}

export default async function ProtectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <ProtectWizard />
    </div>
  );
}
