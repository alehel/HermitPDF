import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The Docker image build sets NEXT_OUTPUT_STANDALONE=1 to get a
  // self-contained server bundle (.next/standalone). Gated on an env var so
  // the regular `next build` + `next start` deployment flow is unaffected —
  // `next start` refuses to run with standalone output enabled.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  serverExternalPackages: ["mupdf"],
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
