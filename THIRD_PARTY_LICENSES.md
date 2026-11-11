# Third-Party Licenses

HermitPDF bundles and redistributes the following third-party software. Their copyright notices and license terms are reproduced here in compliance with the respective licenses.

---

## MuPDF / MuPDF.js

- **Project:** [MuPDF](https://mupdf.com) ([MuPDF.js](https://github.com/ArtifexSoftware/mupdf.js) npm package)
- **Copyright:** © 2004–2025 Artifex Software, Inc., 39 Mesa Street, Suite 108A, San Francisco, CA 94129, USA
- **License:** GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)
- **Upstream source:** <https://cgit.ghostscript.com/mupdf.git/>
- **Commercial licensing:** Available from Artifex — see <https://artifex.com/contact/mupdf-inquiry.php>

MuPDF is distributed under the AGPL-3.0. The full license text is available in this repository's [LICENSE](./LICENSE) file (HermitPDF is licensed under the same terms) and at <https://www.gnu.org/licenses/agpl-3.0.html>.

The following notice from MuPDF's source is reproduced verbatim:

> Copyright (C) 2004-2025 Artifex Software, Inc.
>
> This file is part of MuPDF WASM Library.
>
> MuPDF is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
>
> MuPDF is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
>
> You should have received a copy of the GNU Affero General Public License along with MuPDF. If not, see <https://www.gnu.org/licenses/agpl-3.0.en.html>.
>
> Alternative licensing terms are available from the licensor. For commercial licensing, see <https://www.artifex.com/> or contact Artifex Software, Inc. for further information.

HermitPDF uses MuPDF unmodified, as published on npm (`mupdf@^1.27.0`). The exact version is pinned in [package-lock.json](./package-lock.json).

---

## PdfCraft (web build)

- **Project:** [PdfCraft](https://github.com/storytold/pdfcraft), the editor behind HermitPDF's `/workbench` route
- **Copyright:** © 2026 ArtCraft Team and the PdfCraft contributors
- **License:** MIT OR Apache-2.0, at the licensee's option
- **Version:** v0.20.0, the unmodified `pdfcraft-web-0.20.0.zip` release asset, pinned by SHA-256 in [scripts/fetch-pdfcraft.mjs](./scripts/fetch-pdfcraft.mjs)

HermitPDF serves the PdfCraft web build unmodified under `/pdfcraft/`. It is downloaded at install/build time rather than committed. The release's own `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE` files ship alongside it and stay available at `/pdfcraft/LICENSE-MIT`, `/pdfcraft/LICENSE-APACHE` and `/pdfcraft/NOTICE`. `NOTICE` lists the third-party material PdfCraft bundles, including its fonts (SIL Open Font License 1.1).

`public/pdfcraft-icon.png` is PdfCraft's app icon (the 512 px render, `assets/app-icon/hicolor/512x512/apps/ai.storyteller.pdfcraft.png` upstream), used unmodified as the backdrop of the home page's PdfCraft button. It's contributor-original artwork, licensed MIT OR Apache-2.0 like the rest of PdfCraft.

The ArtCraft name, wordmark and logos are trademarks of the ArtCraft Team. They aren't covered by PdfCraft's open-source license and appear only inside the unmodified PdfCraft app.

The release also bundles the [ocrs](https://github.com/robertknight/ocrs) text-recognition models by Robert Knight (`/pdfcraft/models/`), licensed under CC-BY-SA-4.0. Their licence texts and attribution (`ATTRIBUTION.txt`) ship beside them.

---

## Source code availability (AGPL-3.0 §13)

Because HermitPDF is offered to users over a network, the AGPL-3.0 entitles every user interacting with the application to receive the Corresponding Source. The full source for HermitPDF — including the dependency manifest that pins MuPDF — is available at:

<https://codeberg.org/alehel/hermitpdf>
