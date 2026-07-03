"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HtmlIcon, HtmlFilePlusIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { DismissibleBanner } from "@/components/DismissibleBanner";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatSize } from "@/lib/formatSize";
import { checkerboardStyle } from "@/lib/utils";
import {
  contentWidthCssPx,
  DEFAULT_HTML_TO_PDF_CONFIG,
  HTML_ACCEPT,
  HTML_MARGIN_SETTINGS,
  HTML_ORIENTATIONS,
  HTML_PAGE_SIZE_KEYS,
  MAX_HTML_BYTES,
  MAX_MARGIN_MM,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  PRESET_MARGIN_MM,
  uniformMarginsMm,
  htmlPdfFilename,
  isHtmlFile,
  resolveLayoutOptions,
  urlPdfFilename,
  type HtmlLayoutOptions,
  type HtmlPageSizeKey,
  type HtmlToPdfConfig,
} from "@/lib/htmlToPdf";
import { fetchHtmlPage, FetchPageError } from "@/lib/fetchHtmlPage";
import { lowerHtmlForPdf, mightNeedLowering } from "@/lib/lowerHtml";
import { convertHtmlToPdf, renderHtmlPreview } from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";

type InputMode = "upload" | "paste" | "url";

type HtmlSource =
  | { origin: "file"; name: string; html: string } // html frozen at ingest
  | { origin: "paste" } // live html lives in pasteText so it stays editable
  | { origin: "url"; url: string; html: string }; // url = final address after redirects

/**
 * Extract the document <title> for the PDF metadata. DOMParser is inert — it
 * never executes scripts or fetches subresources — and the parsed tree is
 * discarded immediately; user HTML is never inserted into the app's DOM.
 */
function extractHtmlTitle(html: string): string | undefined {
  try {
    const title = new DOMParser().parseFromString(html, "text/html").title.trim();
    return title || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Rewrite every href in a fetched page to an absolute URL before conversion.
 * mupdf's HTML parser normalizes leading slashes away ("/about" → "about",
 * "//cdn.x/y" → "cdn.x/y"), which loses the information needed to resolve
 * root- and protocol-relative links correctly afterwards — so resolve them
 * up front while the original strings are still intact. Fragment-only hrefs
 * are kept as-is so in-page anchors stay internal GoTo destinations. Uses
 * the same inert DOMParser as extractHtmlTitle; nothing enters the app DOM.
 */
function absolutizeHtmlLinks(html: string, baseUrl: string): string {
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const anchor of parsed.querySelectorAll("a[href], area[href]")) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) continue;
      try {
        anchor.setAttribute("href", new URL(href, baseUrl).href);
      } catch {
        // unresolvable href — leave untouched
      }
    }
    return "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;
  } catch {
    // Fall back to the raw page; the worker still best-effort-resolves
    // relative links against options.baseUrl.
    return html;
  }
}

export function HtmlToPdfWizard() {
  const t = useTranslations("htmlToPdfWizard");

  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [pasteText, setPasteText] = useState("");
  const [urlText, setUrlText] = useState("");
  const [urlError, setUrlError] = useState<{ message: string; tip?: string } | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [source, setSource] = useState<HtmlSource | null>(null);
  const [config, setConfig] = useState<HtmlToPdfConfig>(DEFAULT_HTML_TO_PDF_CONFIG);
  const [banner, setBanner] = useState<string | null>(null);

  const [previewPage, setPreviewPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const showOverlay = useDelayedFlag(isExporting);

  const reqIdRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const lowerCacheRef = useRef<{ key: string; out: string } | null>(null);

  // Unlike the PDF wizards there is no OPFS storage and no worker-side
  // document handle to release — the HTML lives only in React state and every
  // worker call is stateless — so no ingestion hooks or cleanup effects.
  const html =
    source == null ? "" : source.origin === "paste" ? pasteText : source.html;
  const isEmpty = source === null;

  const debouncedHtml = useDebouncedValue(html);
  const debouncedConfig = useDebouncedValue(config);
  const debouncedPreviewPage = useDebouncedValue(previewPage);

  /* ---- Input handling ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const file = fileList[0];
      if (!isHtmlFile(file)) {
        setBanner(t("rejectedFile", { file: file.name }));
        return;
      }
      if (file.size > MAX_HTML_BYTES) {
        setBanner(t("oversizedFile", { file: file.name }));
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        setBanner(t("readFailed"));
        return;
      }
      setSource({ origin: "file", name: file.name, html: text });
      setPreviewPage(1);
      setPageCount(null);
      setPreviewFailed(false);
      setBanner(fileList.length > 1 ? t("onlyOneFile") : null);
    },
    [t]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } =
    useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, {
    ariaLabel: t("dropTitle"),
    accept: HTML_ACCEPT,
  });

  const handleUsePaste = useCallback(() => {
    if (!pasteText.trim()) return;
    if (new Blob([pasteText]).size > MAX_HTML_BYTES) {
      setBanner(t("oversizedFile", { file: t("pastedHtml") }));
      return;
    }
    setSource({ origin: "paste" });
    setPreviewPage(1);
    setPageCount(null);
    setPreviewFailed(false);
  }, [pasteText, t]);

  const handleFetchUrl = useCallback(async () => {
    if (!urlText.trim() || isFetching) return;
    setIsFetching(true);
    setUrlError(null);
    try {
      const { html: fetched, finalUrl } = await fetchHtmlPage(urlText);
      setSource({ origin: "url", url: finalUrl, html: absolutizeHtmlLinks(fetched, finalUrl) });
      setPreviewPage(1);
      setPageCount(null);
      setPreviewFailed(false);
    } catch (e) {
      const err = e instanceof FetchPageError ? e : null;
      switch (err?.kind) {
        case "invalid":
          setUrlError({ message: t("urlErrorInvalid") });
          break;
        case "insecure":
          setUrlError({ message: t("urlErrorInsecure") });
          break;
        case "cors":
          setUrlError({
            message: t("urlErrorCors", { host: err.detail.host ?? "" }),
            tip: t("urlErrorCorsTip"),
          });
          break;
        case "unreachable":
          setUrlError({ message: t("urlErrorUnreachable", { host: err.detail.host ?? "" }) });
          break;
        case "http":
          setUrlError({ message: t("urlErrorHttp", { status: err.detail.status ?? 0 }) });
          break;
        case "notHtml":
          setUrlError({ message: t("urlErrorNotHtml", { type: err.detail.type ?? "" }) });
          break;
        case "oversized":
          setUrlError({ message: t("urlErrorOversized") });
          break;
        default:
          setUrlError({ message: t("urlErrorGeneric") });
      }
    } finally {
      setIsFetching(false);
    }
  }, [urlText, isFetching, t]);

  // Keep pasteText on remove so the user can tweak the markup and re-preview.
  const handleRemove = useCallback(() => {
    setSource(null);
    setPreviewImageData(null);
    setPageCount(null);
    setPreviewPage(1);
    setPreviewFailed(false);
  }, []);

  /* ---- Layout lowering: rewrite flex/grid via the browser engine so mupdf
     lays them out faithfully. Cached per html+content-width (the width
     changes the browser's wrap points); any failure falls back to the raw
     HTML so conversion never breaks on it. ---- */
  const prepareHtml = useCallback(
    async (
      raw: string,
      options: HtmlLayoutOptions,
      cfg: Pick<HtmlToPdfConfig, "adaptLayout" | "stripWhitespace">
    ): Promise<string> => {
      const adapt = cfg.adaptLayout && mightNeedLowering(raw);
      if (!adapt && !cfg.stripWhitespace) return raw;
      const width = contentWidthCssPx(options);
      const key = `${width}|${adapt}|${cfg.stripWhitespace}|${raw}`;
      const cache = lowerCacheRef.current;
      if (cache && cache.key === key) return cache.out;
      try {
        const out = await lowerHtmlForPdf(raw, width, {
          adaptLayout: adapt,
          fullWidth: cfg.stripWhitespace,
        });
        lowerCacheRef.current = { key, out };
        return out;
      } catch {
        return raw;
      }
    },
    []
  );

  /* ---- Live preview: debounced re-layout + render of the current page.
     The monotonic request id drops superseded results (Strict Mode double
     mounts, or the user typing faster than the worker lays out). ---- */
  useEffect(() => {
    if (isEmpty || debouncedHtml.trim() === "") {
      setPreviewImageData(null);
      setPageCount(null);
      return;
    }
    const myReqId = ++reqIdRef.current;
    setIsPreviewLoading(true);
    (async () => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = previewBoxRef.current?.clientWidth ?? 600;
        const targetWidthPx = Math.min(1600, Math.round(cssWidth * dpr));
        const layoutOptions = resolveLayoutOptions(debouncedConfig);
        const prepared = await prepareHtml(debouncedHtml, layoutOptions, debouncedConfig);
        if (reqIdRef.current !== myReqId) return; // superseded during lowering
        const result = await renderHtmlPreview(
          prepared,
          layoutOptions,
          debouncedPreviewPage - 1,
          targetWidthPx
        );
        if (reqIdRef.current !== myReqId) return; // superseded
        setPageCount(result.pageCount);
        setPreviewImageData(result.imageData);
        setPreviewFailed(false);
        // Re-layout can shrink the document below the current page.
        if (debouncedPreviewPage > result.pageCount) setPreviewPage(result.pageCount);
      } catch {
        if (reqIdRef.current !== myReqId) return;
        setPreviewFailed(true);
        setPreviewImageData(null);
        setPageCount(null);
      } finally {
        if (reqIdRef.current === myReqId) setIsPreviewLoading(false);
      }
    })();
  }, [isEmpty, debouncedHtml, debouncedConfig, debouncedPreviewPage, prepareHtml]);

  /* ---- Paint preview to canvas ---- */
  useEffect(() => {
    if (!previewImageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = previewImageData.width;
    canvas.height = previewImageData.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(previewImageData, 0, 0);
    }
  }, [previewImageData]);

  /* ---- Export ---- */
  const handleExport = useCallback(async () => {
    if (!html.trim()) return;
    setIsExporting(true);
    try {
      const title = extractHtmlTitle(html);
      const baseUrl = source?.origin === "url" ? source.url : undefined;
      const layoutOptions = resolveLayoutOptions(config, title, baseUrl);
      const prepared = await prepareHtml(html, layoutOptions, config);
      const { bytes } = await convertHtmlToPdf(prepared, layoutOptions);
      const filename =
        source?.origin === "file"
          ? htmlPdfFilename(source.name)
          : source?.origin === "url"
            ? urlPdfFilename(source.url)
            : htmlPdfFilename(null);
      downloadPdf(bytes, filename);
    } catch {
      setBanner(t("conversionFailed"));
    } finally {
      setIsExporting(false);
    }
  }, [html, config, source, t, prepareHtml]);

  const htmlByteSize = useMemo(() => (html ? new Blob([html]).size : 0), [html]);

  // One margin field, positioned inside the margin band it controls on the
  // page diagram below. The position is the label; screen readers get the
  // side name via aria-label.
  const marginInput = (side: "top" | "right" | "bottom" | "left", position: string) => (
    <input
      type="number"
      min={0}
      max={MAX_MARGIN_MM}
      step={1}
      value={config.customMarginsMm[side]}
      aria-label={t(`margin_${side}` as Parameters<typeof t>[0])}
      title={t(`margin_${side}` as Parameters<typeof t>[0])}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        if (isNaN(v)) return;
        setConfig((c) => ({
          ...c,
          customMarginsMm: { ...c.customMarginsMm, [side]: v },
        }));
      }}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        const clamped = Math.min(MAX_MARGIN_MM, Math.max(0, isNaN(v) ? 0 : v));
        setConfig((c) => ({
          ...c,
          customMarginsMm: { ...c.customMarginsMm, [side]: clamped },
        }));
      }}
      className={`h-8 w-12 rounded-md border border-border bg-background text-center text-sm text-foreground tabular-nums focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${position}`}
    />
  );

  const pasteEditor = (
    <textarea
      rows={12}
      value={pasteText}
      onChange={(e) => setPasteText(e.target.value)}
      spellCheck={false}
      placeholder={t("pastePlaceholder")}
      aria-label={t("pasteLabel")}
      className="w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
    />
  );

  return (
    <>
      {fileInput}

      <ProcessingOverlay
        visible={showOverlay}
        title={t("overlayTitle")}
        description={t("overlayDescription")}
      />

      {banner && (
        <DismissibleBanner
          message={banner}
          dismissLabel={t("dismiss")}
          onDismiss={() => setBanner(null)}
        />
      )}

      <WizardContainer
        icon={<HtmlIcon size={20} />}
        title={t("title")}
        empty={isEmpty}
        wide={!isEmpty}
        footer={
          !isEmpty
            ? {
                statusText:
                  pageCount != null ? t("pageCount", { count: pageCount }) : t("rendering"),
                buttonLabel: isExporting ? t("converting") : t("downloadPdf"),
                onButtonClick: handleExport,
                disabled: isExporting || !html.trim(),
              }
            : undefined
        }
      >
        {isEmpty ? (
          <Tabs
            value={inputMode}
            onValueChange={(v) => setInputMode(v as InputMode)}
            className="mt-6"
          >
            <TabsList className="w-full">
              <TabsTrigger value="upload">{t("uploadTab")}</TabsTrigger>
              <TabsTrigger value="paste">{t("pasteTab")}</TabsTrigger>
              <TabsTrigger value="url">{t("urlTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <DropZone
                title={t("dropTitle")}
                subtitle={t("dropSubtitle")}
                privacyNote={t("privacyNote")}
                onClick={openFilePicker}
                onDragOver={handleDropZoneDragOver}
                onDragLeave={handleDropZoneDragLeave}
                onDrop={handleDropZoneDrop}
                isDragOver={isDragOver}
                autoFocus
                icon={HtmlFilePlusIcon}
              />
            </TabsContent>

            <TabsContent value="paste">
              <div className="flex flex-col gap-3">
                {pasteEditor}
                <button
                  type="button"
                  onClick={handleUsePaste}
                  disabled={!pasteText.trim()}
                  className="self-start rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:shadow-lg disabled:opacity-60"
                >
                  {t("usePastedHtml")}
                </button>
                <p className="text-sm text-muted-foreground">{t("privacyNote")}</p>
              </div>
            </TabsContent>

            <TabsContent value="url">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleFetchUrl();
                }}
              >
                <input
                  type="text"
                  inputMode="url"
                  value={urlText}
                  onChange={(e) => {
                    setUrlText(e.target.value);
                    setUrlError(null);
                  }}
                  spellCheck={false}
                  placeholder={t("urlPlaceholder")}
                  aria-label={t("urlLabel")}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {urlError && (
                  <div role="alert" className="rounded-xl bg-accent px-4 py-3">
                    <p className="text-xs text-foreground">{urlError.message}</p>
                    {urlError.tip && (
                      <p className="mt-2 text-xs font-medium text-primary">{urlError.tip}</p>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!urlText.trim() || isFetching}
                  className="self-start rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:shadow-lg disabled:opacity-60"
                >
                  {isFetching ? t("fetchingUrl") : t("fetchUrl")}
                </button>
                <p className="text-sm text-muted-foreground">{t("urlPrivacyNote")}</p>
              </form>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("file")}
                </h3>
                <FileCard
                  name={
                    source.origin === "file"
                      ? source.name
                      : source.origin === "url"
                        ? source.url
                        : t("pastedHtml")
                  }
                  subtitle={formatSize(htmlByteSize)}
                  onRemove={handleRemove}
                  removeTitle={t("remove")}
                />
              </div>

              {source.origin === "paste" && (
                <div>
                  <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {t("pasteLabel")}
                  </h3>
                  {pasteEditor}
                </div>
              )}

              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("settings")}
                </h3>

                <div className="space-y-5 rounded-xl border border-border bg-card p-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-foreground">
                      {t("pageSize")}
                    </span>
                    <select
                      value={config.pageSize}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          pageSize: e.target.value as HtmlPageSizeKey,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {HTML_PAGE_SIZE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className="mb-2 block text-sm font-medium text-foreground">
                      {t("orientation")}
                    </span>
                    <div className="flex gap-2 rounded-xl border border-border bg-card p-1">
                      {HTML_ORIENTATIONS.map((orientation) => (
                        <button
                          key={orientation}
                          type="button"
                          onClick={() => setConfig((c) => ({ ...c, orientation }))}
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            config.orientation === orientation
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {t(`orientation_${orientation}` as Parameters<typeof t>[0])}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t("margins")}</span>
                      {config.margin === "custom" && (
                        <span className="text-xs text-muted-foreground">{t("marginsMmHint")}</span>
                      )}
                    </div>
                    <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
                      {HTML_MARGIN_SETTINGS.map((margin) => (
                        <button
                          key={margin}
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              margin,
                              // Seed the custom fields from the outgoing preset
                              // so switching to Custom starts from what the
                              // user currently sees.
                              customMarginsMm:
                                margin === "custom" && c.margin !== "custom"
                                  ? uniformMarginsMm(PRESET_MARGIN_MM[c.margin])
                                  : c.customMarginsMm,
                            }))
                          }
                          className={`flex-1 rounded-lg px-1 py-2 text-sm font-medium transition-colors ${
                            config.margin === margin
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {t(`margin_${margin}` as Parameters<typeof t>[0])}
                        </button>
                      ))}
                    </div>
                    {config.margin === "custom" && (
                      // Page diagram: a sheet whose margin bands hold the four
                      // inputs, wrapping a dashed content area with skeleton
                      // text lines.
                      <div className="relative mt-3 h-52 rounded-lg border border-border bg-background">
                        <div
                          aria-hidden="true"
                          className="absolute inset-x-16 inset-y-12 flex flex-col justify-center gap-1.5 rounded border border-dashed border-border p-3"
                        >
                          <div className="h-1 rounded bg-border" />
                          <div className="h-1 w-5/6 rounded bg-border" />
                          <div className="h-1 w-2/3 rounded bg-border" />
                        </div>
                        {marginInput("top", "absolute left-1/2 top-2 -translate-x-1/2")}
                        {marginInput("left", "absolute left-2 top-1/2 -translate-y-1/2")}
                        {marginInput("right", "absolute right-2 top-1/2 -translate-y-1/2")}
                        {marginInput("bottom", "absolute bottom-2 left-1/2 -translate-x-1/2")}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t("zoom")}</span>
                      <span className="text-xs font-medium text-foreground tabular-nums">
                        {t("zoomValue", { percent: config.zoom })}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_ZOOM_PERCENT}
                      max={MAX_ZOOM_PERCENT}
                      step={10}
                      value={config.zoom}
                      onChange={(e) => setConfig((c) => ({ ...c, zoom: e.target.valueAsNumber }))}
                      className="w-full accent-primary"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{t("zoomHint")}</p>
                  </div>

                  <div className="h-px bg-border" />

                  <label className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.keepLinks}
                      onClick={() => setConfig((c) => ({ ...c, keepLinks: !c.keepLinks }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        config.keepLinks ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.keepLinks ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-medium text-foreground">{t("keepLinks")}</span>
                      <p className="text-xs text-muted-foreground">{t("keepLinksDesc")}</p>
                    </div>
                  </label>

                  <div className="h-px bg-border" />

                  <label className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.adaptLayout}
                      onClick={() => setConfig((c) => ({ ...c, adaptLayout: !c.adaptLayout }))}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        config.adaptLayout ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.adaptLayout ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {t("adaptLayout")}
                      </span>
                      <p className="text-xs text-muted-foreground">{t("adaptLayoutDesc")}</p>
                    </div>
                  </label>

                  <div className="h-px bg-border" />

                  <label className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.stripWhitespace}
                      onClick={() =>
                        setConfig((c) => ({ ...c, stripWhitespace: !c.stripWhitespace }))
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        config.stripWhitespace ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.stripWhitespace ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {t("stripWhitespace")}
                      </span>
                      <p className="text-xs text-muted-foreground">{t("stripWhitespaceDesc")}</p>
                    </div>
                  </label>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t("localNote")}</p>
            </div>

            <div className="lg:sticky lg:top-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("preview")}
              </h3>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("previewPage")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={pageCount ?? 1}
                      value={previewPage}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (!isNaN(v)) setPreviewPage(v);
                      }}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value);
                        const max = pageCount ?? 1;
                        setPreviewPage(Math.max(1, Math.min(max, isNaN(v) ? 1 : v)));
                      }}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">/ {pageCount ?? "–"}</span>
                  {isPreviewLoading && (
                    <span className="ml-auto text-xs text-muted-foreground">{t("rendering")}</span>
                  )}
                </div>

                <div
                  ref={previewBoxRef}
                  className="rounded-lg border border-border"
                  style={checkerboardStyle}
                >
                  {previewFailed ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      {t("previewFailed")}
                    </p>
                  ) : (
                    <canvas
                      ref={canvasRef}
                      className="block w-full rounded-lg"
                      style={{ maxHeight: "70vh", objectFit: "contain" }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </WizardContainer>
    </>
  );
}
