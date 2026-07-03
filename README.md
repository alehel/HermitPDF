<div align="center">
    <img src="public/hermitpdf-full-readme.svg" alt="HermitPDF" width="400" />
</div>

<div align="center">Privacy-first PDF editor that runs entirely in your browser.</div>

## About

HermitPDF is a free, open-source PDF editor that runs entirely in your browser. Your files are never uploaded to a server — all processing happens client-side, making it safe for sensitive documents.

No account, no paywall, no watermarks, no ads.

Available at [hermitpdf.com](https://hermitpdf.com), or self-host it with Docker (see below).

## Features

Quick-start **Wizards** for common tasks (merge, split, extract images) and an advanced **Workbench** for multi-step editing:

- **Merge** — Combine pages from different PDFs
- **Split** — Break documents into individual pages or remove unwanted pages
- **Rotate** — Rotate individual or all pages
- **Reorder** — Drag-and-drop page and document reordering
- **Extract images** — Pull embedded images from PDFs
- **Export with metadata** — Set custom title, author, subject, and keywords

## Tech Stack

**Framework & UI**
- [Next.js](https://nextjs.org) / [React](https://react.dev) — Framework and UI library
- [Tailwind CSS](https://tailwindcss.com) / [shadcn/ui](https://ui.shadcn.com) — Styling and UI components
- [next-intl](https://next-intl.dev) — Internationalization
- [@tanstack/react-virtual](https://tanstack.com/virtual) — Virtual scrolling

**PDF Processing**
- [mupdf](https://mupdf.com) — PDF rendering and manipulation (WASM)
- [Comlink](https://github.com/GoogleChromeLabs/comlink) — Web Worker communication

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Other commands

```bash
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Self-hosting with Docker

```bash
docker build -t hermitpdf .
docker run -p 3000:3000 hermitpdf
```

The image is the self-hosted distribution: the home page skips the
introductory hero (people running their own instance already know what it
is — the header logo suffices). To keep the full home page, build with
`--build-arg SELF_HOSTED=0`.

## AI Disclaimer

This project is being developed with the assistance of an AI coding agent (Claude). AI-generated code is reviewed before being merged. All architectural decisions, product direction, and PR approval remain with the human developers.

## License

[AGPL-3.0](LICENSE). Third-party attributions are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

The `main` branch of this repository reflects what is currently deployed at [hermitpdf.com](https://hermitpdf.com). This satisfies the AGPL-3.0 §13 requirement to make Corresponding Source available to network users.
