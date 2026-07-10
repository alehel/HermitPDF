/*
 * HermitPDF service worker — makes the app fully usable offline once loaded.
 *
 * On install (and on a "refresh-precache" message from the app, sent once per
 * page load while online) it crawls every app route, caches the HTML, and
 * recursively caches every /_next/static asset referenced from that HTML and
 * from the fetched CSS/JS — which pulls in lazily-loaded chunks, the mupdf
 * worker chunk, and fonts. The mupdf WASM binary and the public images the UI
 * references are precached explicitly since nothing in the HTML names them.
 *
 * Runtime strategy:
 *   - navigations: network-first, falling back to cached pages
 *   - RSC payloads (?_rsc=): network-first, cached per exact URL so
 *     prefetched client-side navigations keep working offline
 *   - /_next/static (content-hashed, immutable): cache-first
 *   - other same-origin GETs: stale-while-revalidate
 */

const VERSION = "v1";
const PRECACHE = `hermitpdf-precache-${VERSION}`;
const PAGES = `hermitpdf-pages-${VERSION}`;
const RSC = `hermitpdf-rsc-${VERSION}`;
const RUNTIME = `hermitpdf-runtime-${VERSION}`;
const ALL_CACHES = [PRECACHE, PAGES, RSC, RUNTIME];

const DEFAULT_LOCALE = "en";
const LOCALES = ["en"];

// Keep in sync with the routes under src/app/[locale]/ (see also sitemap.ts).
const ROUTES = [
  "",
  "/attach",
  "/bates",
  "/collate",
  "/compress",
  "/contrast",
  "/extract",
  "/merge",
  "/protect",
  "/rotate",
  "/split",
  "/unlock",
  "/workbench",
];

// Assets not discoverable by crawling the HTML. The wasm binary is fetched by
// the mupdf worker at runtime; the SVGs are referenced from component code.
const STATIC_ASSETS = [
  "/mupdf-wasm.wasm",
  "/hermitpdf-full.svg",
  "/hermitpdf-full-dark.svg",
  "/hermitpdf-icon.svg",
  "/favicon.ico",
  "/manifest.webmanifest",
];

/** Extract same-origin /_next/static asset URLs from HTML, CSS, or JS text. */
function extractAssetUrls(text) {
  const urls = new Set();
  // Direct references: src="/_next/static/...", url(/_next/static/...),
  // and escaped occurrences inside RSC flight data (\"/_next/static/...\").
  for (const match of text.matchAll(/\/_next\/static\/[^"'\\)\s<>]+/g)) {
    urls.add(match[0]);
  }
  // Bundler-internal references are often root-relative without the /_next
  // prefix, e.g. "static/chunks/xxx.js" (this is how the mupdf worker chunk
  // is referenced from JS).
  for (const match of text.matchAll(/"(static\/(?:chunks|media)\/[^"'\\)\s<>]+)/g)) {
    urls.add(`/_next/${match[1]}`);
  }
  return urls;
}

/**
 * Crawl all app pages and their subresources into PRECACHE.
 * Never throws — a partially successful crawl still leaves the app better
 * off, and the next page load retries via the "refresh-precache" message.
 */
async function precacheAll() {
  const cache = await caches.open(PRECACHE);
  const discovered = new Set();

  // Pages: always re-fetched so a refresh picks up new deployments.
  const pages = LOCALES.flatMap((l) => ROUTES.map((r) => `/${l}${r}`));
  await Promise.all(
    pages.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok || res.redirected) return;
        const text = await res.clone().text();
        await cache.put(url, res);
        for (const u of extractAssetUrls(text)) discovered.add(u);
      } catch {
        // Offline or flaky network — keep whatever is already cached.
      }
    })
  );

  // Fixed assets: revalidated against the HTTP cache (ETag) on every crawl
  // since their URLs never change but their contents can.
  await Promise.all(
    STATIC_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch {}
    })
  );

  // Breadth-first crawl of discovered assets. Content-hashed URLs are skipped
  // when already cached; CSS/JS responses are scanned for further references
  // (nested chunks, fonts, the mupdf worker chunk).
  const queue = [...discovered];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const batch = queue.splice(0, 8);
    await Promise.all(
      batch.map(async (url) => {
        try {
          let res = await cache.match(url);
          if (!res) {
            res = await fetch(url);
            if (!res.ok || res.redirected) return;
            await cache.put(url, res.clone());
          }
          const type = res.headers.get("content-type") || "";
          if (/javascript|css/.test(type)) {
            const text = await res.text();
            for (const u of extractAssetUrls(text)) {
              if (!seen.has(u)) {
                seen.add(u);
                queue.push(u);
              }
            }
          }
        } catch {}
      })
    );
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheAll());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("hermitpdf-") && !ALL_CACHES.includes(n))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "refresh-precache") {
    event.waitUntil(precacheAll());
  }
});

const MATCH_OPTS = { ignoreVary: true };

async function matchPage(path) {
  const opts = { ...MATCH_OPTS, ignoreSearch: true };
  for (const name of [PAGES, PRECACHE]) {
    const cache = await caches.open(name);
    const res = await cache.match(path, opts);
    if (res) return res;
  }
  return null;
}

async function handleNavigation(request) {
  try {
    const res = await fetch(request);
    // Cache successful page loads so visited pages stay available offline.
    // Redirected responses must not be cached: serving one for a navigation
    // is rejected by the browser.
    if (res.ok && !res.redirected) {
      const cache = await caches.open(PAGES);
      cache.put(new URL(request.url).pathname, res.clone());
    }
    return res;
  } catch {
    const path = new URL(request.url).pathname;
    // Exact page, then its default-locale variant (covers the "/" →
    // "/en" middleware redirect, which cannot run offline), then the
    // default-locale home page as a last-resort app shell.
    return (
      (await matchPage(path)) ||
      (await matchPage(`/${DEFAULT_LOCALE}${path === "/" ? "" : path}`)) ||
      (await matchPage(`/${DEFAULT_LOCALE}`)) ||
      Response.error()
    );
  }
}

async function handleRsc(request) {
  const cache = await caches.open(RSC);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) cache.put(request.url, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request.url, MATCH_OPTS);
    // On a miss the router falls back to a full navigation, which
    // handleNavigation serves from the page caches.
    return cached || Response.error();
  }
}

// For content-hashed /_next/static assets. The query string is ignored when
// matching: the body never varies with it, and Turbopack loads its worker
// chunk with bootstrap config in the query (?params=...) while the crawl
// caches the bare URL.
async function cacheFirst(request) {
  const opts = { ...MATCH_OPTS, ignoreSearch: true };
  const cached = await caches.match(request.url, opts);
  if (cached) {
    // Serve a synthetic copy rather than the cached response itself. A cached
    // response carries the URL it was stored under, and for worker scripts
    // that URL becomes the worker's location — dropping the #params=...
    // fragment Turbopack puts on worker URLs, which breaks its bootstrap
    // ("Missing worker bootstrap config"). A synthetic response has no URL,
    // so the browser falls back to the request URL, fragment intact.
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers,
    });
  }
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) {
      const cache = await caches.open(RUNTIME);
      cache.put(new URL(request.url).pathname, res.clone());
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached =
    (await cache.match(request.url, MATCH_OPTS)) ||
    (await (await caches.open(PRECACHE)).match(request.url, MATCH_OPTS));
  const network = fetch(request)
    .then((res) => {
      if (res.ok && !res.redirected) cache.put(request.url, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  } else if (url.searchParams.has("_rsc")) {
    event.respondWith(handleRsc(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
