import { downloadBlob } from "./download";

/**
 * Minimal ZIP writer for stored (uncompressed) entries.
 * PNGs, JPEGs, and PDFs are already compressed, so storing them avoids
 * redundant work.
 *
 * Returns a Blob assembled from the original entry arrays plus small header
 * chunks — entry bytes are never copied into an intermediate buffer, so the
 * peak JS-heap cost of zipping is just the headers. (A Blob also lets the
 * browser manage the assembled bytes itself, including keeping large ones
 * out of the JS heap entirely.)
 *
 * Implements the PKZIP APPNOTE format:
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function buildZip(entries: { name: string; data: Uint8Array }[]): Blob {
  const parts: BlobPart[] = [];
  const centralHeaders: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);

    // Local file header (APPNOTE 4.3.7): 30 fixed bytes + name; data follows
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);  // local file header signature
    localView.setUint16(4, 20, true);           // version needed to extract (2.0)
    localView.setUint16(6, 0, true);            // general purpose flags
    localView.setUint16(8, 0, true);            // compression method: stored
    localView.setUint16(10, 0, true);           // last mod file time
    localView.setUint16(12, 0, true);           // last mod file date
    localView.setUint32(14, crc, true);         // crc-32
    localView.setUint32(18, entry.data.length, true); // compressed size
    localView.setUint32(22, entry.data.length, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true);  // file name length
    localView.setUint16(28, 0, true);           // extra field length
    local.set(nameBytes, 30);
    parts.push(local, entry.data as BlobPart);

    // Central directory header (APPNOTE 4.3.12): 46 fixed bytes + name
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);   // central directory header signature
    centralView.setUint16(4, 20, true);            // version made by
    centralView.setUint16(6, 20, true);            // version needed to extract
    centralView.setUint16(8, 0, true);             // general purpose flags
    centralView.setUint16(10, 0, true);            // compression method: stored
    centralView.setUint16(12, 0, true);            // last mod file time
    centralView.setUint16(14, 0, true);            // last mod file date
    centralView.setUint32(16, crc, true);          // crc-32
    centralView.setUint32(20, entry.data.length, true); // compressed size
    centralView.setUint32(24, entry.data.length, true); // uncompressed size
    centralView.setUint16(28, nameBytes.length, true);  // file name length
    centralView.setUint16(30, 0, true);            // extra field length
    centralView.setUint16(32, 0, true);            // file comment length
    centralView.setUint16(34, 0, true);            // disk number start
    centralView.setUint16(36, 0, true);            // internal file attributes
    centralView.setUint32(38, 0, true);            // external file attributes
    centralView.setUint32(42, offset, true);       // relative offset of local header
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length + entry.data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const header of centralHeaders) centralSize += header.length;

  // End of central directory record (APPNOTE 4.3.16): 22 fixed bytes
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);     // end of central directory signature
  eocdView.setUint16(4, 0, true);               // number of this disk
  eocdView.setUint16(6, 0, true);               // disk where central directory starts
  eocdView.setUint16(8, entries.length, true);   // entries in central directory on this disk
  eocdView.setUint16(10, entries.length, true);  // total entries in central directory
  eocdView.setUint32(12, centralSize, true);     // size of central directory
  eocdView.setUint32(16, centralOffset, true);   // offset of start of central directory
  eocdView.setUint16(20, 0, true);              // ZIP file comment length

  // Layout: local file entries, then central directory, then EOCD
  parts.push(...centralHeaders, eocd);
  return new Blob(parts, { type: "application/zip" });
}

/** Trigger a browser download of a ZIP file. */
export function downloadZip(zip: Blob, filename: string): void {
  downloadBlob(zip, filename);
}

/**
 * CRC-32 computation for ZIP file entries.
 * Uses the standard polynomial 0xEDB88320 — the bit-reversed form of the
 * CRC-32 polynomial (ISO 3309 / ITU-T V.42) — via a 256-entry lookup table.
 * The table form processes one byte per step instead of eight bit shifts,
 * which matters when zipping hundreds of megabytes of extracted images.
 */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
