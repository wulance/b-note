export interface ZipEntry {
  path: string;
  data: string | Uint8Array;
}

const encoder = new TextEncoder();

let crcLookup: Uint32Array | null = null;

function getCrcLookup(): Uint32Array {
  if (crcLookup) return crcLookup;
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcLookup = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcLookup();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createRecord(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function normalizeData(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? encoder.encode(data) : data;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '') || 'file';
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function asBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const stamp = dosTimestamp();
  let offset = 0;

  for (const entry of entries) {
    const pathBytes = encoder.encode(normalizePath(entry.path));
    const data = normalizeData(entry.data);
    const checksum = crc32(data);

    const local = createRecord(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint16(10, stamp.time, true);
    local.view.setUint16(12, stamp.date, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.byteLength, true);
    local.view.setUint32(22, data.byteLength, true);
    local.view.setUint16(26, pathBytes.byteLength, true);
    local.view.setUint16(28, 0, true);
    chunks.push(local.bytes, pathBytes, data);

    const directory = createRecord(46);
    directory.view.setUint32(0, 0x02014b50, true);
    directory.view.setUint16(4, 20, true);
    directory.view.setUint16(6, 20, true);
    directory.view.setUint16(8, 0x0800, true);
    directory.view.setUint16(10, 0, true);
    directory.view.setUint16(12, stamp.time, true);
    directory.view.setUint16(14, stamp.date, true);
    directory.view.setUint32(16, checksum, true);
    directory.view.setUint32(20, data.byteLength, true);
    directory.view.setUint32(24, data.byteLength, true);
    directory.view.setUint16(28, pathBytes.byteLength, true);
    directory.view.setUint16(30, 0, true);
    directory.view.setUint16(32, 0, true);
    directory.view.setUint16(34, 0, true);
    directory.view.setUint16(36, 0, true);
    directory.view.setUint32(38, 0, true);
    directory.view.setUint32(42, offset, true);
    central.push(directory.bytes, pathBytes);

    offset += local.bytes.byteLength + pathBytes.byteLength + data.byteLength;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((size, part) => size + part.byteLength, 0);
  const end = createRecord(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, centralOffset, true);
  end.view.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, end.bytes].map(asBlobPart), { type: 'application/zip' });
}
