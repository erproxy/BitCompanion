import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const align = (offset, boundary) => Math.ceil(offset / boundary) * boundary;

function readCString(bytes, offset) {
  const end = bytes.indexOf(0, offset);
  if (end < 0) throw new Error('Unterminated string in Unity bundle');
  return [bytes.toString('utf8', offset, end), end + 1];
}

function unpackBlock(input, size, codec) {
  if (codec === 0 && input.length === size) return input;
  if (codec !== 2 && codec !== 3) throw new Error('Unsupported Unity bundle compression');

  // UnityFS stores each LZ4 block without a frame header.
  const output = Buffer.allocUnsafe(size);
  let source = 0;
  let target = 0;
  function length(initial) {
    if (initial !== 15) return initial;
    let total = initial;
    let next;
    do {
      if (source >= input.length) throw new Error('Truncated LZ4 block');
      next = input[source++];
      total += next;
    } while (next === 255);
    return total;
  }

  while (source < input.length) {
    const token = input[source++];
    const literal = length(token >>> 4);
    if (source + literal > input.length || target + literal > size) throw new Error('Invalid LZ4 literal');
    input.copy(output, target, source, source + literal);
    source += literal;
    target += literal;
    if (source === input.length) break;

    const distance = input.readUInt16LE(source);
    source += 2;
    const match = length(token & 15) + 4;
    if (!distance || distance > target || target + match > size) throw new Error('Invalid LZ4 match');
    if (distance >= match) output.copy(output, target, target - distance, target - distance + match);
    else for (let i = 0; i < match; i++) output[target + i] = output[target + i - distance];
    target += match;
  }
  if (target !== size) throw new Error('Invalid Unity block size');
  return output;
}

function bundleDirectory(read, fileSize) {
  const header = read(0, Math.min(256, fileSize));
  const [signature, versionAt] = readCString(header, 0);
  const version = header.readUInt32BE(versionAt);
  if (signature !== 'UnityFS' || ![7, 8].includes(version)) throw new Error('Unsupported UnityFS bundle version');
  const [, revisionAt] = readCString(header, versionAt + 4);
  const [, sizesAt] = readCString(header, revisionAt);
  const bundleSize = Number(header.readBigUInt64BE(sizesAt));
  if (bundleSize !== fileSize) throw new Error('Incomplete Unity bundle');
  const compressedSize = header.readUInt32BE(sizesAt + 8);
  const uncompressedSize = header.readUInt32BE(sizesAt + 12);
  const flags = header.readUInt32BE(sizesAt + 16);
  const headerEnd = align(sizesAt + 20, 16);
  const directoryOffset = flags & 0x80 ? bundleSize - compressedSize : headerEnd;
  const dataOffset = flags & 0x80 ? headerEnd : headerEnd + compressedSize;
  const directory = unpackBlock(read(directoryOffset, compressedSize), uncompressedSize, flags & 63);

  let fileOffset = flags & 0x200 ? align(dataOffset, 16) : dataOffset;
  let blockOffset = 0;
  const blocks = [];
  const count = directory.readUInt32BE(16);
  let at = 20;
  for (let index = 0; index < count; index++, at += 10) {
    const size = directory.readUInt32BE(at);
    const packedSize = directory.readUInt32BE(at + 4);
    const codec = directory.readUInt16BE(at + 8) & 63;
    blocks.push({ offset: blockOffset, size, fileOffset, packedSize, codec });
    fileOffset += packedSize;
    blockOffset += size;
  }
  const entries = [];
  const entryCount = directory.readUInt32BE(at);
  at += 4;
  for (let index = 0; index < entryCount; index++) {
    const offset = Number(directory.readBigUInt64BE(at));
    const size = Number(directory.readBigUInt64BE(at + 8));
    const entryFlags = directory.readUInt32BE(at + 16);
    [, at] = readCString(directory, at + 20);
    if (entryFlags & 4) entries.push({ offset, size });
  }
  return { blocks, entries, size: blockOffset };
}

function readSegment(read, { blocks, size: bundleSize }) {
  let cachedIndex = -1;
  let cachedBlock;
  return (offset, size) => {
    if (offset < 0 || size < 0 || offset + size > bundleSize) throw new Error('Unity segment exceeds bundle');
    const bytes = Buffer.allocUnsafe(size);
    let first = 0;
    let last = blocks.length - 1;
    while (first < last) {
      const middle = Math.floor((first + last) / 2);
      const { offset: start, size: length } = blocks[middle];
      if (offset < start + length) last = middle;
      else first = middle + 1;
    }
    // The Steam bundle is several gigabytes unpacked. Read only the blocks used by the text assets.
    for (let index = first, copied = 0; copied < size; index++) {
      const block = blocks[index];
      if (index !== cachedIndex) {
        cachedBlock = unpackBlock(read(block.fileOffset, block.packedSize), block.size, block.codec);
        cachedIndex = index;
      }
      const start = offset + copied - block.offset;
      const length = Math.min(size - copied, block.size - start);
      cachedBlock.copy(bytes, copied, start, start + length);
      copied += length;
    }
    return bytes;
  };
}

function readTextAssets(read, requested, assets) {
  const header = read(0, 48);
  if (header.readUInt32BE(8) !== 22 || header[16] !== 0) throw new Error('Unsupported Unity serialized file version');
  const dataOffset = Number(header.readBigUInt64BE(32));
  const metadata = read(0, dataOffset);
  const [, versionEnd] = readCString(metadata, 48);
  const hasTypeTree = metadata[versionEnd + 4] !== 0;
  const count = metadata.readUInt32LE(versionEnd + 5);
  const classes = [];
  let at = versionEnd + 9;
  for (let i = 0; i < count; i++) {
    const classId = metadata.readInt32LE(at);
    classes.push(classId);
    // Class ID, stripped flag, script index, optional script GUID, type hash.
    at += classId === 114 ? 39 : 23;
    if (hasTypeTree) {
      const nodes = metadata.readUInt32LE(at);
      const stringsSize = metadata.readUInt32LE(at + 4);
      at += 8 + nodes * 32 + stringsSize;
      const dependencies = metadata.readUInt32LE(at);
      at += 4 + dependencies * 4;
    }
  }

  const objectCount = metadata.readUInt32LE(at);
  at += 4;
  for (let i = 0; i < objectCount && assets.size < requested.size; i++) {
    at = align(at, 4);
    const objectAt = at;
    at += 24;
    if (classes[metadata.readInt32LE(objectAt + 20)] !== 49) continue; // TextAsset
    const offset = dataOffset + Number(metadata.readBigUInt64LE(objectAt + 8));
    const size = metadata.readUInt32LE(objectAt + 16);
    if (size < 8) continue;
    const prefix = read(offset, Math.min(size, 512));
    const nameSize = prefix.readUInt32LE(0);
    const sizeAt = align(4 + nameSize, 4);
    if (sizeAt + 4 > prefix.length) continue;
    const name = prefix.toString('utf8', 4, 4 + nameSize);
    if (!requested.has(name) || assets.has(name)) continue;
    const textSize = prefix.readUInt32LE(sizeAt);
    if (sizeAt + 4 + textSize > size) throw new Error('Invalid Unity TextAsset size');
    assets.set(name, read(offset + sizeAt + 4, textSize));
  }
}

export function readUnityTextAssets(filename, requested) {
  const fd = openSync(filename, 'r');
  try {
    const fileSize = fstatSync(fd).size;
    const read = (offset, size) => {
      if (offset < 0 || size < 0 || offset + size > fileSize) throw new Error('Read exceeds Unity bundle');
      const bytes = Buffer.allocUnsafe(size);
      for (let copied = 0; copied < size;) {
        const length = readSync(fd, bytes, copied, size - copied, offset + copied);
        if (!length) throw new Error('Truncated Unity bundle');
        copied += length;
      }
      return bytes;
    };
    const directory = bundleDirectory(read, fileSize);
    const segment = readSegment(read, directory);
    const assets = new Map();
    for (const { offset, size } of directory.entries) {
      readTextAssets((start, length) => {
        if (start + length > size) throw new Error('Read exceeds Unity serialized file');
        return segment(offset + start, length);
      }, requested, assets);
      if (assets.size === requested.size) break;
    }
    return assets;
  } finally {
    closeSync(fd);
  }
}
