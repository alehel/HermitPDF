import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { poppins, urbanist } from "@/fonts";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://hermitpdf.com"),
  title: "HermitPDF — Privacy-first PDF toolkit",
  description:
    "Merge, split, rotate, watermark, and compress PDFs entirely in your browser. No files are ever uploaded to a server.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${poppins.variable} ${urbanist.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("pw-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {/* Plausible analytics — only included when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set.
            Omitted from self-hosted Docker builds so they ship analytics-free. */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script defer data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN} src="https://plausible.alehel.org/js/script.js" />
        )}
      </head>
      <body
        className="h-full antialiased"
        style={{ fontFamily: "var(--font-poppins), system-ui, sans-serif" }}
      >
        <NextIntlClientProvider>
          <ThemeProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
