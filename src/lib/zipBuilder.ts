/**
 * Minimal ZIP writer for stored (uncompressed) entries.
 * PNGs are already compressed, so storing them avoids redundant work.
 *
 * Implements the PKZIP APPNOTE format:
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);

    // Local file header (APPNOTE 4.3.7): 30 fixed bytes + name + data
    const local = new Uint8Array(30 + nameBytes.length + entry.data.length);
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
    local.set(entry.data, 30 + nameBytes.length);
    localHeaders.push(local);

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

    offset += local.length;
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

  // Combine all parts: local file entries, then central directory, then EOCD
  const totalSize = offset + centralSize + 22;
  const zip = new Uint8Array(totalSize);
  let pos = 0;
  for (const localHeader of localHeaders) { zip.set(localHeader, pos); pos += localHeader.length; }
  for (const centralHeader of centralHeaders) { zip.set(centralHeader, pos); pos += centralHeader.length; }
  zip.set(eocd, pos);

  return zip;
}

/** Trigger a browser download of a ZIP file. */
export function downloadZip(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * CRC-32 computation for ZIP file entries.
 * Uses the standard polynomial 0xEDB88320 — the bit-reversed form of the
 * CRC-32 polynomial (ISO 3309 / ITU-T V.42), enabling a right-shift
 * implementation instead of left-shift.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
