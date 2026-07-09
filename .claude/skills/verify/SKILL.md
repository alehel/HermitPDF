---
name: verify
description: Build, run, and drive HermitPDF in a browser to verify changes end-to-end.
---

# Verifying HermitPDF changes

Everything runs client-side (mupdf WASM in a worker), so verification means
driving the real UI in a browser and inspecting the downloaded PDFs.

## Build & run

```bash
npm install        # postinstall copies mupdf-wasm.wasm into public/
npm run build
npm run start -- -p 3111   # production server; dev server (npm run dev) also works
```

## Drive with Playwright

Playwright is not a project dep — install `playwright-core` in the scratchpad
and launch the pre-installed Chromium:

```js
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
```

Gotchas that work:
- Routes are locale-prefixed: `http://localhost:3111/en/<wizard>`.
- Wizards use hidden `<input type=file>` elements; target them by aria-label
  (set from the wizard's translation strings) and `setInputFiles(...)`.
- Downloads: `Promise.all([page.waitForEvent("download"), button.click()])`,
  then `download.saveAs(...)`. Multi-file outputs come as a ZIP.
- `curl --noproxy localhost` when probing the server from bash.

## Inspect output PDFs

Use the project's own mupdf package from the repo root (ESM only):

```bash
node --input-type=module -e "
import * as mupdf from 'mupdf'; import fs from 'fs';
const doc = mupdf.Document.openDocument(fs.readFileSync('out.pdf'), 'application/pdf');
console.log(doc.countPages());
// page text: JSON.parse(doc.loadPage(0).toStructuredText().asJSON())
"
```

## Fixtures

- `test-fixtures/doc1.pdf` — 10 pages
- `test-fixtures/doc2.pdf` — 7 pages
- `test-fixtures/protected.pdf` — password-protected
