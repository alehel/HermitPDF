// Lower modern CSS layouts into constructs mupdf's HTML engine understands,
// using the browser's own layout engine as the oracle. mupdf lays out
// flex/grid containers as stacked blocks and ignores margin:auto centering;
// this module renders the document in a hidden, script-less, network-blocked
// iframe, reads the geometry the browser computed, and rewrites:
//
//  - each visual row of a flex/grid container into a one-row <table> whose
//    cells carry explicit pt widths (mupdf honors pt cell widths exactly;
//    percentages are distributed incorrectly — verified empirically);
//  - margin:auto-style horizontal centering into explicit pt margins.
//
// Children are moved, not cloned, so the document's own stylesheets keep
// applying to them. On any failure the caller falls back to the original
// HTML. Main-thread only (needs a live layout engine) — do not import from
// the worker.

const PX_TO_PT = 72 / 96;
const LOAD_TIMEOUT_MS = 4000;
const IMAGE_SETTLE_MS = 800;

export interface LoweringOptions {
  /**
   * Fidelity passes: rewrite flex/grid rows into tables, hoist @media/
   * @supports/@layer rules (mupdf ignores all conditional CSS), rasterize
   * inline SVGs, give gradients a solid-color fallback, and drop
   * position:fixed chrome.
   */
  adaptLayout: boolean;
  /** Expand width-constrained centered columns to the full content width. */
  fullWidth: boolean;
  /** Emulate print media: apply @media print rules, drop screen-only ones. */
  printStyles: boolean;
}

// Textual fast-path: constructs the browser pass can actually improve.
const FIDELITY_RE =
  /display\s*:\s*(inline-)?(flex|grid)|@media|@supports|@layer|<svg[\s>]|gradient\(|position\s*:\s*(fixed|sticky)/i;

/** Whether running the browser pass could change anything for this input. */
export function needsBrowserPass(html: string, opts: LoweringOptions): boolean {
  if (opts.fullWidth) return true;
  if (opts.printStyles && /@media|media\s*=/i.test(html)) return true;
  return opts.adaptLayout && FIDELITY_RE.test(html);
}

export async function lowerHtmlForPdf(
  html: string,
  contentWidthPx: number,
  opts: LoweringOptions
): Promise<string> {
  const iframe = document.createElement("iframe");
  try {
    // allow-same-origin (and nothing else) lets us read the layout while
    // scripts stay disabled; the injected CSP blocks every network load the
    // document could otherwise trigger (images, stylesheets, fonts, media).
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;border:0;width:${Math.max(50, Math.round(contentWidthPx))}px;height:2000px;`;
    iframe.srcdoc = buildSrcdoc(html);

    const loaded = new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      setTimeout(() => reject(new Error("lowering iframe load timeout")), LOAD_TIMEOUT_MS);
    });
    document.body.appendChild(iframe);
    await loaded;

    const doc = iframe.contentDocument;
    // Cast for the iframe realm's constructors (instanceof must use them).
    const win = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!doc || !win || !doc.body) throw new Error("lowering iframe has no document");

    // data: images decode asynchronously and can affect layout.
    await settleImages(doc);

    // Order matters: conditional CSS is applied first (it can restyle
    // everything below), fixed chrome is dropped and SVGs swapped for
    // same-size raster images before any geometry is measured, and widening
    // runs before flex/grid measurement so rows spread across the final
    // column width.
    const hoisted =
      opts.adaptLayout || opts.printStyles
        ? hoistConditionalCss(doc, win, opts.printStyles)
        : 0;
    const dropped = opts.adaptLayout ? removeFixedElements(doc, win) : 0;
    const rasterized = opts.adaptLayout ? await rasterizeSvgs(doc) : 0;
    const tinted = opts.adaptLayout ? fallbackGradientBackgrounds(doc, win) : 0;
    const widened = opts.fullWidth ? stripSideWhitespace(doc, win) : 0;

    const plans = opts.adaptLayout ? collectFlexGridPlans(doc, win) : [];
    // Preserving author centering makes no sense when the user asked for the
    // side space to be stripped.
    const centered =
      opts.adaptLayout && !opts.fullWidth ? collectCenteringFixes(doc, win) : [];
    if (
      plans.length === 0 &&
      centered.length === 0 &&
      hoisted + dropped + rasterized + tinted + widened === 0
    ) {
      return html;
    }

    for (const plan of plans) applyFlexGridPlan(doc, plan);
    for (const fix of centered) {
      fix.el.style.marginLeft = `${fix.leftPt}pt`;
      fix.el.style.marginRight = `${fix.rightPt}pt`;
    }

    return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  } finally {
    iframe.remove();
  }
}

/**
 * Sanitize with the inert DOMParser and inject a lockdown CSP as the first
 * head element. Scripts are removed outright, and meta[http-equiv] / base
 * are stripped so the document can neither redirect the iframe (meta
 * refresh) nor weaken the injected policy.
 *
 * The CSP alone is NOT sufficient: Chrome's preload scanner can start an
 * <img> fetch from srcdoc before the meta policy is applied (observed
 * empirically). So every non-data: resource reference is also stripped —
 * mupdf cannot fetch them either, so this changes nothing in the output.
 */
function buildSrcdoc(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const el of parsed.querySelectorAll("script, base, meta[http-equiv], link")) el.remove();

  for (const el of parsed.querySelectorAll("[src], [srcset], [poster], [background]")) {
    for (const attr of ["src", "srcset", "poster", "background"]) {
      const value = el.getAttribute(attr);
      if (value !== null && !/^\s*data:/i.test(value)) el.removeAttribute(attr);
    }
  }
  // CSS can trigger loads too (background-image etc.) — neutralize every
  // url() that isn't a data: URI, in both style sheets and style attributes.
  const stripCssUrls = (css: string) =>
    css.replace(/url\(\s*(['"]?)(?!\s*data:)[^)]*\1\s*\)/gi, "none");
  for (const style of parsed.querySelectorAll("style")) {
    style.textContent = stripCssUrls(style.textContent ?? "");
  }
  for (const el of parsed.querySelectorAll("[style]")) {
    const inline = el.getAttribute("style");
    if (inline && /url\s*\(/i.test(inline)) el.setAttribute("style", stripCssUrls(inline));
  }

  const csp = parsed.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;");
  parsed.head.insertBefore(csp, parsed.head.firstChild);
  return "<!DOCTYPE html>\n" + parsed.documentElement.outerHTML;
}

async function settleImages(doc: Document): Promise<void> {
  const pending = [...doc.images].filter((img) => !img.complete);
  if (pending.length === 0) return;
  const all = Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, IMAGE_SETTLE_MS))]);
}

/**
 * mupdf ignores every conditional CSS block — @media, @supports, and @layer
 * (verified empirically) — so sites keeping their styling inside
 * `@media screen and (min-width: …)` render unstyled. Unwrap the rules that
 * apply at our synthetic viewport and write the flattened text back into
 * each <style> element, which both re-styles the iframe (so measurements
 * match) and makes the rules visible to mupdf in the serialized output.
 *
 * With `preferPrint`, media lists are evaluated the way a printing browser
 * would: print-typed queries match, screen-typed ones do not.
 */
function hoistConditionalCss(
  doc: Document,
  win: Window & typeof globalThis,
  preferPrint: boolean
): number {
  let changed = 0;
  for (const styleEl of [...doc.querySelectorAll("style")]) {
    const mediaAttr = styleEl.getAttribute("media");
    if (mediaAttr) {
      if (!mediaMatches(win, mediaAttr, preferPrint)) {
        styleEl.remove();
        changed++;
        continue;
      }
      styleEl.removeAttribute("media");
      changed++;
    }
    const sheet = styleEl.sheet;
    if (!sheet) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (![...rules].some(isConditionalRule(win))) continue;
    const flattened = flattenCssRules(win, rules, preferPrint);
    styleEl.textContent = flattened; // re-parses: iframe layout now matches
    changed++;
  }
  return changed;
}

function isConditionalRule(win: Window & typeof globalThis) {
  return (rule: CSSRule) =>
    rule instanceof win.CSSMediaRule ||
    rule instanceof win.CSSSupportsRule ||
    rule instanceof win.CSSImportRule ||
    ("CSSLayerBlockRule" in win && rule instanceof win.CSSLayerBlockRule);
}

function flattenCssRules(
  win: Window & typeof globalThis,
  rules: CSSRuleList,
  preferPrint: boolean
): string {
  let out = "";
  for (const rule of rules) {
    if (rule instanceof win.CSSMediaRule) {
      if (mediaMatches(win, rule.conditionText, preferPrint)) {
        out += flattenCssRules(win, rule.cssRules, preferPrint);
      }
    } else if (rule instanceof win.CSSSupportsRule) {
      if (win.CSS.supports(rule.conditionText)) {
        out += flattenCssRules(win, rule.cssRules, preferPrint);
      }
    } else if ("CSSLayerBlockRule" in win && rule instanceof win.CSSLayerBlockRule) {
      // Layer order nuances are lost, but source order is preserved — far
      // closer than mupdf dropping the whole block.
      out += flattenCssRules(win, rule.cssRules, preferPrint);
    } else if (rule instanceof win.CSSImportRule) {
      // External imports are stripped/blocked — nothing to emit.
    } else {
      out += rule.cssText + "\n";
    }
  }
  return out;
}

function mediaMatches(
  win: Window & typeof globalThis,
  condition: string,
  preferPrint: boolean
): boolean {
  if (!preferPrint) return win.matchMedia(condition).matches; // iframe = screen
  // Print emulation per comma-separated query: print → evaluate its feature
  // conditions (type rewritten to all), screen-typed → never matches.
  const rewritten = condition
    .split(",")
    .map((q) =>
      /\bprint\b/i.test(q)
        ? q.replace(/\bprint\b/gi, "all")
        : /\bscreen\b/i.test(q)
          ? "not all"
          : q
    )
    .join(",");
  return win.matchMedia(rewritten).matches;
}

/**
 * mupdf has no viewport, so position:fixed chrome (cookie banners, floating
 * navbars, chat bubbles) falls into the document flow as junk blocks —
 * remove it. Sticky elements stay: they occupy normal flow space and render
 * correctly as static.
 */
function removeFixedElements(doc: Document, win: Window & typeof globalThis): number {
  let removed = 0;
  for (const el of [...doc.body.querySelectorAll<HTMLElement>("*")]) {
    if (!el.isConnected || !(el instanceof win.HTMLElement)) continue;
    if (win.getComputedStyle(el).position === "fixed") {
      el.remove();
      removed++;
    }
  }
  return removed;
}

/**
 * mupdf drops inline <svg> entirely (verified: zero ink). Rasterize each one
 * in the parent document at 2× and swap in a same-size data: PNG <img>.
 * SVG-as-image never loads external resources, so the canvas stays clean and
 * nothing touches the network.
 */
async function rasterizeSvgs(doc: Document): Promise<number> {
  const svgs = [...doc.body.querySelectorAll("svg")];
  let replaced = 0;
  await Promise.all(
    svgs.map(async (svg) => {
      try {
        const rect = svg.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const clone = svg.cloneNode(true) as SVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(Math.round(rect.width)));
        clone.setAttribute("height", String(Math.round(rect.height)));
        const svgUrl =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(new XMLSerializer().serializeToString(clone));
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("svg decode failed"));
          image.src = svgUrl;
        });
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(rect.width * scale));
        canvas.height = Math.max(1, Math.round(rect.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const replacement = doc.createElement("img");
        replacement.setAttribute("src", canvas.toDataURL("image/png"));
        replacement.setAttribute("width", String(Math.round(rect.width)));
        replacement.setAttribute("height", String(Math.round(rect.height)));
        svg.replaceWith(replacement);
        replaced++;
      } catch {
        // keep the original; mupdf drops it, same as before
      }
    })
  );
  return replaced;
}

/**
 * Gradient backgrounds render as nothing in mupdf. Approximate each with a
 * solid fill from the gradient's first color stop so tinted sections keep
 * their tone instead of turning white.
 */
function fallbackGradientBackgrounds(
  doc: Document,
  win: Window & typeof globalThis
): number {
  let tinted = 0;
  for (const el of doc.body.querySelectorAll<HTMLElement>("*")) {
    if (!(el instanceof win.HTMLElement)) continue;
    const cs = win.getComputedStyle(el);
    if (!cs.backgroundImage.includes("gradient(")) continue;
    const firstStop = cs.backgroundImage.match(/rgba?\([^)]*\)/);
    if (!firstStop) continue;
    el.style.setProperty("background-image", "none", "important");
    // Keep an author-set solid background; only fill transparent ones.
    if (/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$|^transparent$/.test(cs.backgroundColor)) {
      el.style.setProperty("background-color", firstStop[0], "important");
    }
    tinted++;
  }
  return tinted;
}

// Replaced/self-sized elements that must never be stretched to full width.
const NON_STRETCH_TAGS = new Set([
  "IMG",
  "VIDEO",
  "AUDIO",
  "SVG",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "BUTTON",
  "TABLE",
  "HR",
]);

/**
 * Expand width-constrained content columns to the full available width —
 * the "centered div with empty colored bands on both sides" pattern. A
 * normal-flow block with `width: auto` always fills its parent, so any
 * block sitting with meaningful side slack is constrained by width,
 * max-width, or gutter margins; all three are neutralized. Oversized
 * horizontal paddings (percentage gutters) are clamped separately.
 *
 * Runs up to three read-then-write rounds so nested wrappers unwind
 * without forcing a reflow per element. Returns the number of elements
 * changed.
 */
function stripSideWhitespace(doc: Document, win: Window & typeof globalThis): number {
  const MIN_SLACK_PX = 24;
  let total = 0;
  for (let round = 0; round < 3; round++) {
    const writes: (() => void)[] = [];
    for (const el of [doc.body, ...doc.body.querySelectorAll<HTMLElement>("*")]) {
      if (!(el instanceof win.HTMLElement) || NON_STRETCH_TAGS.has(el.tagName)) continue;
      const cs = win.getComputedStyle(el);
      if (
        (cs.display !== "block" && cs.display !== "flow-root" && cs.display !== "flex" && cs.display !== "grid") ||
        cs.position === "absolute" ||
        cs.position === "fixed" ||
        cs.cssFloat !== "none"
      ) {
        continue;
      }
      const parent = el.parentElement;
      if (!parent) continue;
      const pcs = win.getComputedStyle(parent);
      // Flex/grid items are sized by their container — the layout pass owns
      // those; stretching individual items would destroy the rows.
      if (/^(inline-)?(flex|grid)$/.test(pcs.display)) continue;

      const rect = el.getBoundingClientRect();
      const prect = parent.getBoundingClientRect();
      const parentContentWidth =
        prect.width -
        parsePx(pcs.paddingLeft) -
        parsePx(pcs.paddingRight) -
        parsePx(pcs.borderLeftWidth) -
        parsePx(pcs.borderRightWidth);

      if (parentContentWidth - rect.width > MIN_SLACK_PX && rect.width > 0) {
        writes.push(() => {
          el.style.setProperty("max-width", "none", "important");
          el.style.setProperty("width", "auto", "important");
          el.style.setProperty("margin-left", "0", "important");
          el.style.setProperty("margin-right", "0", "important");
        });
        continue;
      }

      // Percentage-style gutters: a full-width wrapper whose horizontal
      // padding eats a large share of it.
      const padX = parsePx(cs.paddingLeft) + parsePx(cs.paddingRight);
      if (rect.width > 0 && padX > rect.width * 0.25) {
        writes.push(() => {
          el.style.setProperty("padding-left", "12pt", "important");
          el.style.setProperty("padding-right", "12pt", "important");
        });
      }
    }
    if (writes.length === 0) break;
    for (const write of writes) write();
    total += writes.length;
  }
  return total;
}

interface RowItem {
  el: HTMLElement;
  rect: DOMRect;
}

interface FlexGridPlan {
  el: HTMLElement;
  rows: RowItem[][];
  /** Container content-box left edge, for leading spacers (centering etc.). */
  contentLeft: number;
  verticalAlign: string;
}

function collectFlexGridPlans(doc: Document, win: Window & typeof globalThis): FlexGridPlan[] {
  const plans: FlexGridPlan[] = [];
  for (const el of doc.body.querySelectorAll<HTMLElement>("*")) {
    const cs = win.getComputedStyle(el);
    const display = cs.display;
    if (
      display !== "flex" &&
      display !== "inline-flex" &&
      display !== "grid" &&
      display !== "inline-grid"
    ) {
      continue;
    }

    const items: RowItem[] = [];
    for (const child of el.children) {
      if (!(child instanceof win.HTMLElement)) continue;
      const ccs = win.getComputedStyle(child);
      if (ccs.display === "none" || ccs.position === "absolute" || ccs.position === "fixed") {
        continue;
      }
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      items.push({ el: child, rect });
    }
    if (items.length === 0) continue;

    // Group into visual rows: an item joins the current row while it
    // vertically overlaps the row's first item.
    items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    const rows: RowItem[][] = [];
    for (const item of items) {
      const row = rows[rows.length - 1];
      if (row && item.rect.top < row[0].rect.bottom - 1) row.push(item);
      else rows.push([item]);
    }
    for (const row of rows) row.sort((a, b) => a.rect.left - b.rect.left);

    const rect = el.getBoundingClientRect();
    const contentLeft =
      rect.left + parsePx(cs.borderLeftWidth) + parsePx(cs.paddingLeft);
    const alignItems = cs.alignItems;
    const verticalAlign =
      alignItems === "center" ? "middle" : alignItems === "flex-end" || alignItems === "end" ? "bottom" : "top";

    plans.push({ el, rows, contentLeft, verticalAlign });
  }
  return plans;
}

function applyFlexGridPlan(doc: Document, plan: FlexGridPlan): void {
  const { el, rows, contentLeft, verticalAlign } = plan;
  // Neutralize the (ignored-by-mupdf) flex/grid display; the container keeps
  // its element, classes, and therefore its own styling.
  el.style.display = "block";

  // Pure column stacks need no tables — restore normal flow plus row gaps.
  if (rows.every((row) => row.length === 1)) {
    for (let i = 0; i < rows.length - 1; i++) {
      const gap = rows[i + 1][0].rect.top - rows[i][0].rect.bottom;
      if (gap >= 1) rows[i][0].el.style.marginBottom = pt(gap);
    }
    return;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const table = doc.createElement("table");
    const rowBottom = Math.max(...row.map((i) => i.rect.bottom));
    const gap = r < rows.length - 1 ? rows[r + 1][0].rect.top - rowBottom : 0;
    table.setAttribute(
      "style",
      `border-collapse:collapse${gap >= 1 ? `;margin-bottom:${pt(gap)}` : ""}`
    );
    const tr = doc.createElement("tr");
    table.appendChild(tr);

    let cursor = contentLeft;
    for (const item of row) {
      const lead = item.rect.left - cursor;
      if (lead >= 1) tr.appendChild(spacerCell(doc, lead));
      const td = doc.createElement("td");
      td.setAttribute(
        "style",
        `width:${pt(item.rect.width)};padding:0;vertical-align:${verticalAlign}`
      );
      td.appendChild(item.el); // move, keeping the child's own styling
      tr.appendChild(td);
      cursor = item.rect.right;
    }
    el.appendChild(table);
  }
}

function spacerCell(doc: Document, widthPx: number): HTMLTableCellElement {
  const td = doc.createElement("td");
  td.setAttribute("style", `width:${pt(widthPx)};padding:0`);
  return td;
}

interface CenteringFix {
  el: HTMLElement;
  leftPt: number;
  rightPt: number;
}

/**
 * Detect margin:auto-style horizontal centering geometrically (computed
 * styles report used pixel values, never "auto"): a width-constrained block
 * sitting symmetrically inside its parent's content box.
 */
function collectCenteringFixes(
  doc: Document,
  win: Window & typeof globalThis
): CenteringFix[] {
  const fixes: CenteringFix[] = [];
  for (const el of doc.body.querySelectorAll<HTMLElement>("*")) {
    const cs = win.getComputedStyle(el);
    if (cs.display !== "block" || cs.position === "absolute" || cs.position === "fixed") continue;
    const constrained = cs.maxWidth !== "none" || /(px|pt|rem|em|ch)$/.test(cs.width);
    if (!constrained) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const pcs = win.getComputedStyle(parent);
    if (pcs.display === "flex" || pcs.display === "grid") continue; // handled above
    const rect = el.getBoundingClientRect();
    const prect = parent.getBoundingClientRect();
    const left = rect.left - (prect.left + parsePx(pcs.borderLeftWidth) + parsePx(pcs.paddingLeft));
    const right = prect.right - parsePx(pcs.borderRightWidth) - parsePx(pcs.paddingRight) - rect.right;
    if (left > 8 && right > 8 && Math.abs(left - right) < 2) {
      fixes.push({ el, leftPt: round2(left * PX_TO_PT), rightPt: round2(right * PX_TO_PT) });
    }
  }
  return fixes;
}

function pt(px: number): string {
  return `${round2(px * PX_TO_PT)}pt`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePx(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
