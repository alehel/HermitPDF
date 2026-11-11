<div align="center">
    <img src="public/hermitpdf-full-readme.svg" alt="HermitPDF" width="400" />
</div>

<div align="center">Privacy-first PDF editor that runs entirely in your browser.</div>

## About

HermitPDF is a free, open-source PDF editor that runs entirely in your browser. Your files are never uploaded to a server — all processing happens client-side, making it safe for sensitive documents.

No account, no paywall, no watermarks, no ads.

Available at [hermitpdf.com](https://hermitpdf.com). Docker container image for self hosting coming soon.

## Features

Quick-start **Wizards** for common tasks, and a full **Workbench** editor:

- **Merge** — Combine PDFs and images into one document
- **Split** — Break documents into individual pages or fixed-size chunks
- **Rotate** — Rotate individual or all pages
- **Extract images** — Pull embedded images from PDFs
- **Protect / Unlock**, **Compress**, **Bates numbering**, **Book Scan**, and more
- **Workbench** — A full PDF reader and editor for multi-step work, powered by [PdfCraft](https://github.com/storytold/pdfcraft)

## Tech Stack

**Framework & UI**
- [Next.js](https://nextjs.org) / [React](https://react.dev) — Framework and UI library
- [Tailwind CSS](https://tailwindcss.com) / [shadcn/ui](https://ui.shadcn.com) — Styling and UI components
- [next-intl](https://next-intl.dev) — Internationalization
- [@tanstack/react-virtual](https://tanstack.com/virtual) — Virtual scrolling

**PDF Processing**
- [mupdf](https://mupdf.com) — PDF rendering and manipulation (WASM)
- [Comlink](https://github.com/GoogleChromeLabs/comlink) — Web Worker communication
- [PdfCraft](https://github.com/storytold/pdfcraft) — The Workbench editor (Rust/WASM, embedded unmodified)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

`npm install` also downloads the PdfCraft web build that powers the Workbench (about 34 MB, unpacked to ~75 MB) into `public/pdfcraft/`. The version is pinned and checked against a SHA-256 hash in [`scripts/fetch-pdfcraft.mjs`](scripts/fetch-pdfcraft.mjs). If that download fails, the install still succeeds, but `npm run build` won't. Run `npm run fetch:pdfcraft` to retry. Behind an HTTP proxy, set `NODE_USE_ENV_PROXY=1`.

### Other commands

```bash
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## AI Disclaimer

This project is being developed with the assistance of an AI coding agent (Claude). AI-generated code is reviewed before being merged. All architectural decisions, product direction, and PR approval remain with the human developers.

## License

[AGPL-3.0](LICENSE). Third-party attributions are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

The `main` branch of this repository reflects what is currently deployed at [hermitpdf.com](https://hermitpdf.com). This satisfies the AGPL-3.0 §13 requirement to make Corresponding Source available to network users.
