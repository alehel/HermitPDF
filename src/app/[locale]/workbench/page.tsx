import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { WorkbenchClient } from "./WorkbenchClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "documentPanel" });
  return {
    title: `${t("title")} — HermitPDF`,
    description: t("metaDescription"),
  };
}

export default async function WorkbenchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "documentPanel" });

  return (
    <div className="flex h-full flex-col" data-workbench>
      <AppHeader />
      <main className="flex flex-1 flex-col overflow-hidden">
        <h1 className="sr-only">{t("title")}</h1>
        <WorkbenchClient />
      </main>
    </div>
  );
}
