import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { PdfCraftFrame } from "@/components/PdfCraftFrame";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workbench" });
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
  const t = await getTranslations({ locale, namespace: "workbench" });

  return (
    <div className="flex h-full flex-col">
      <AppHeader>
        <span className="text-xs text-muted-foreground">
          {t("poweredBy")}{" "}
          <a
            href="https://github.com/storytold/pdfcraft"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            PdfCraft
          </a>
        </span>
      </AppHeader>
      <main className="flex flex-1 flex-col overflow-hidden">
        <h1 className="sr-only">{t("title")}</h1>
        <PdfCraftFrame title={t("frameTitle")} loadingLabel={t("loading")} />
      </main>
    </div>
  );
}
