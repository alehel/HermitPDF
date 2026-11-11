import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // pdfcraft/ is the static PdfCraft web build behind /workbench (see
  // scripts/fetch-pdfcraft.mjs); some of its files (LICENSE-MIT, NOTICE) have
  // no extension and must not be redirected to a locale.
  matcher: "/((?!api|trpc|_next|_vercel|pdfcraft/|.*\\..*).*)",
};
