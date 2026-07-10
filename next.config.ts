import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["mupdf"],
  async headers() {
    return [
      {
        // The service worker must never be served stale, or clients would
        // keep running an outdated offline cache strategy indefinitely.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // mupdf-wasm.js conditionally imports Node.js "module" built-in.
      // In the browser this code path is never reached, but Turbopack still
      // resolves it. Alias to an empty shim to avoid the build error.
      module: "./src/shims/empty-module.ts",
    },
  },
};

export default withNextIntl(nextConfig);
