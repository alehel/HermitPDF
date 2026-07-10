import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HermitPDF — Privacy-first PDF toolkit",
    short_name: "HermitPDF",
    description:
      "Merge, split, rotate, watermark, and compress PDFs entirely in your browser. No files are ever uploaded to a server.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5F7",
    theme_color: "#F4F5F7",
    icons: [
      {
        src: "/hermitpdf-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
