import { inflateRawSync } from 'node:zlib';

/** Bound actual expansion before ExcelJS materializes the workbook object graph.
 * XLSX ZIP64/encrypted archives are deliberately outside this local MVP. */
export function validateWorkbookArchive(bytes: Uint8Array): void {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () =>
    new Error(
      'Workbook archive is invalid or exceeds supported extraction limits.',
    );
  let end = -1;
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65557);
    offset--
  ) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw fail();
  const count = buffer.readUInt16LE(end + 10),
    directorySize = buffer.readUInt32LE(end + 12),
    directoryOffset = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) !== 0 ||
    buffer.readUInt16LE(end + 6) !== 0 ||
    count !== buffer.readUInt16LE(end + 8) ||
    count > 5000 ||
    count === 0 ||
    directoryOffset + directorySize > end
  )
    throw fail();
  let offset = directoryOffset,
    total = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw fail();
    const flags = buffer.readUInt16LE(offset + 8),
      method = buffer.readUInt16LE(offset + 10),
      compressed = buffer.readUInt32LE(offset + 20),
      expanded = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28),
      extraLength = buffer.readUInt16LE(offset + 30),
      commentLength = buffer.readUInt16LE(offset + 32),
      localOffset = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      (flags & 1) !== 0 ||
      ![0, 8].includes(method) ||
      expanded > 32 * 1024 * 1024 ||
      (total += expanded) > 100 * 1024 * 1024 ||
      next > directoryOffset + directorySize ||
      localOffset + 30 > directoryOffset
    )
      throw fail();
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (names.has(name)) throw fail();
    names.add(name);
    if (
      buffer.readUInt32LE(localOffset) !== 0x04034b50 ||
      buffer.readUInt16LE(localOffset + 8) !== method
    )
      throw fail();
    const start =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    if (start + compressed > directoryOffset) throw fail();
    const data = buffer.subarray(start, start + compressed);
    const actual =
      method === 0
        ? data.byteLength
        : inflateRawSync(data, { maxOutputLength: 32 * 1024 * 1024 })
            .byteLength;
    if (actual !== expanded) throw fail();
    offset = next;
  }
  if (
    offset !== directoryOffset + directorySize ||
    !names.has('[Content_Types].xml') ||
    !names.has('xl/workbook.xml')
  )
    throw fail();
}
