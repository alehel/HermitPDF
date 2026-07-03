import { MAX_HTML_BYTES } from "./htmlToPdf";

// Fetch a web page's HTML for conversion, classifying failures so the UI can
// explain them. The request goes directly from the user's browser to the
// target site — there is no proxy and no HermitPDF server, so a site that
// withholds CORS headers cannot be fetched, by design of the web platform.

export type FetchPageErrorKind =
  | "invalid"
  | "insecure"
  | "cors"
  | "unreachable"
  | "http"
  | "notHtml"
  | "oversized";

export class FetchPageError extends Error {
  constructor(
    public kind: FetchPageErrorKind,
    public detail: { host?: string; status?: number; type?: string } = {}
  ) {
    super(`fetch page failed: ${kind}`);
  }
}

const FETCH_OPTS: RequestInit = { mode: "cors", redirect: "follow", credentials: "omit" };

export async function fetchHtmlPage(rawInput: string): Promise<{ html: string; finalUrl: string }> {
  const raw = rawInput.trim();
  let url: URL;
  try {
    // Scheme-less input ("example.com/page") is treated as https.
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new FetchPageError("invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchPageError("invalid");
  }
  // Mixed content: an https page cannot fetch http resources at all.
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.protocol === "http:") {
    throw new FetchPageError("insecure");
  }

  let response: Response;
  try {
    response = await fetch(url.href, FETCH_OPTS);
  } catch {
    // fetch() rejects with an identical TypeError for a CORS block and for an
    // unreachable host. An opaque no-cors probe separates them: it succeeds
    // when the server is reachable but withholding CORS headers.
    let reachable = false;
    try {
      await fetch(url.href, { ...FETCH_OPTS, mode: "no-cors" });
      reachable = true;
    } catch {
      // genuinely unreachable (DNS, refused, offline)
    }
    throw new FetchPageError(reachable ? "cors" : "unreachable", { host: url.hostname });
  }

  if (!response.ok) {
    throw new FetchPageError("http", { status: response.status, host: url.hostname });
  }

  const mime = (response.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  const isTextual = mime === "" || mime.includes("html") || mime.includes("xml") || mime.startsWith("text/");
  if (!isTextual) {
    throw new FetchPageError("notHtml", { type: mime });
  }

  const blob = await response.blob();
  if (blob.size > MAX_HTML_BYTES) {
    throw new FetchPageError("oversized");
  }
  // response.url reflects redirects — the right base for resolving the
  // page's relative links later.
  return { html: await blob.text(), finalUrl: response.url || url.href };
}
