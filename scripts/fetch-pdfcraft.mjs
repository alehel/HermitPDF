#!/usr/bin/env node
/*
 * Downloads the PdfCraft web build (https://github.com/storytold/pdfcraft)
 * that powers the /workbench route and unpacks it into public/pdfcraft/.
 *
 * The release is pinned by version and SHA-256 (from the release's
 * SHA256SUMS.txt), so a build always ships exactly the reviewed bundle. The
 * bundle is ~75 MB unpacked (a ~59 MB wasm app plus OCR models), which is why
 * it is fetched rather than committed; public/pdfcraft/ is gitignored.
 *
 * Usage:
 *   node scripts/fetch-pdfcraft.mjs             # fetch if missing/outdated; warn on failure
 *   node scripts/fetch-pdfcraft.mjs --required  # same, but exit non-zero on failure
 *
 * postinstall uses the lenient mode so offline installs still succeed;
 * prebuild uses --required so a production build can never ship without it.
 * Behind an HTTP proxy, run with NODE_USE_ENV_PROXY=1 so fetch honours
 * HTTPS_PROXY.
 *
 * To upgrade: bump VERSION and SHA256 (the `pdfcraft-web-<ver>.zip` line of
 * that release's SHA256SUMS.txt), then run this script and test /workbench.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateRawSync } from "node:zlib";

const VERSION = "0.20.0";
const SHA256 = "5cd9da8025e5e4c587069f9ee5fbfeeb859f8fbc35bfdb0c63fc1f139d7240e6";
const URL_ = `https://github.com/storytold/pdfcraft/releases/download/v${VERSION}/pdfcraft-web-${VERSION}.zip`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "public", "pdfcraft");
const TMP = path.join(ROOT, "public", ".pdfcraft-tmp");
const STAMP_FILE = ".pdfcraft-release";
const STAMP = `${VERSION} ${SHA256}\n`;

const required = process.argv.includes("--required");

async function isCurrent() {
  try {
    const stamp = await readFile(path.join(DEST, STAMP_FILE), "utf8");
    return stamp === STAMP && existsSync(path.join(DEST, "index.html"));
  } catch {
    return false;
  }
}

async function download() {
  const res = await fetch(URL_, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${URL_} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const digest = createHash("sha256").update(buf).digest("hex");
  if (digest !== SHA256) {
    throw new Error(`checksum mismatch for pdfcraft-web-${VERSION}.zip: got ${digest}, expected ${SHA256}`);
  }
  return buf;
}

/**
 * Minimal ZIP reader: walks the central directory and yields
 * { name, data } for every file entry (stored or deflated), verifying each
 * entry's CRC-32. ZIP64 and encrypted entries are rejected — the PdfCraft
 * release uses neither.
 */
function* readZip(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error("ZIP64 archives are not supported");

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directory entry
    if (flags & 0x1) throw new Error(`encrypted entry: ${name}`);
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error(`corrupt local header: ${name}`);
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(start, start + compSize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported compression method ${method}: ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`CRC mismatch: ${name}`);
    yield { name, data };
  }
}

async function extract(buf) {
  await rm(TMP, { recursive: true, force: true });
  const prefix = `pdfcraft-web-${VERSION}/`;
  let files = 0;
  for (const { name, data } of readZip(buf)) {
    if (!name.startsWith(prefix)) throw new Error(`unexpected entry outside ${prefix}: ${name}`);
    const rel = name.slice(prefix.length);
    const out = path.resolve(TMP, rel);
    // Refuse anything that would land outside the extraction directory.
    if (!rel || path.isAbsolute(rel) || !out.startsWith(TMP + path.sep)) {
      throw new Error(`unsafe path in archive: ${name}`);
    }
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, data);
    files++;
  }
  if (!existsSync(path.join(TMP, "index.html"))) throw new Error("archive has no index.html");
  await writeFile(path.join(TMP, STAMP_FILE), STAMP);
  await rm(DEST, { recursive: true, force: true });
  await rename(TMP, DEST);
  return files;
}

async function main() {
  if (await isCurrent()) {
    console.log(`PdfCraft web ${VERSION} already present in public/pdfcraft/`);
    return;
  }
  console.log(`Fetching PdfCraft web ${VERSION}…`);
  const buf = await download();
  const files = await extract(buf);
  console.log(`PdfCraft web ${VERSION}: unpacked ${files} files into public/pdfcraft/`);
}

main().catch(async (err) => {
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  const msg = `Could not fetch PdfCraft web ${VERSION}: ${err.message}`;
  if (required) {
    console.error(`${msg}\nThe /workbench route needs it. Check your network (behind a proxy, set NODE_USE_ENV_PROXY=1) and retry.`);
    process.exit(1);
  }
  console.warn(`warning: ${msg}\n/workbench will not work until \`npm run fetch:pdfcraft\` succeeds.`);
});
