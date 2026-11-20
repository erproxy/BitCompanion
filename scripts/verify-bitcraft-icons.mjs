import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || fileURLToPath(new URL('../data/bitcraft/icons/', import.meta.url)));
const dataRoot = path.resolve(process.argv[3] || fileURLToPath(new URL('../data/bitcraft/', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async filename => JSON.parse(await readFile(path.join(root, filename), 'utf8'));
const [manifest, bindings, missing, sourceBytes] = await Promise.all([
  readJson('manifest.json'), readJson('bindings.json'), readJson('missing.json'), readFile(path.join(dataRoot, 'manifest.json')),
]);
const source = JSON.parse(sourceBytes.toString('utf8'));
assert.equal(manifest.formatVersion, 1);
assert.equal(bindings.formatVersion, 1);
assert.equal(missing.formatVersion, 1);
assert.equal(manifest.dataSnapshot.commit, source.source.commit, 'Icon/data snapshot differs');
assert.equal(manifest.dataSnapshot.manifestSha256, digest(sourceBytes), 'Source manifest changed');
assert.equal(bindings.dataCommit, source.source.commit);
assert.equal(missing.dataCommit, source.source.commit);
assert.equal(bindings.pathBase, '.');

function webpSize(bytes) {
  assert.ok(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', 'Not a WebP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'Truncated WebP RIFF');
  let position = 12, dimensions;
  while (position < bytes.length) {
    assert.ok(position + 8 <= bytes.length, 'Truncated chunk header');
    const kind = bytes.toString('ascii', position, position + 4);
    const size = bytes.readUInt32LE(position + 4);
    const start = position + 8, end = start + size;
    assert.ok(end <= bytes.length, 'Truncated WebP chunk');
    if (kind === 'VP8X' && size >= 10) dimensions = [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    else if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      dimensions ??= [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    } else if (kind === 'VP8 ' && size >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) {
      dimensions ??= [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    }
    position = end + size % 2;
  }
  assert.equal(position, bytes.length, 'Invalid chunk padding');
  assert.ok(dimensions && dimensions.every(value => value > 0), 'Invalid WebP dimensions');
  return dimensions;
}

const actual = { records: 0, imageRecords: 0, glyphRecords: 0, emptyRecords: 0, assetRequests: 0, downloadedAssets: 0, missingAssets: 0, failedAssets: 0, totalBytes: 0, byTable: {} };
const files = new Set();
for (const [assetKey, asset] of Object.entries(manifest.assets)) {
  actual.assetRequests++;
  assert.ok(['downloaded', 'missing', 'failed'].includes(asset.status), `Invalid status: ${assetKey}`);
  const url = new URL(asset.url);
  assert.equal(url.origin, 'https://cdn.brico.app');
  assert.equal(decodeURIComponent(url.pathname), `/sprites/${assetKey}.webp`);
  if (asset.status !== 'downloaded') {
    actual[asset.status === 'missing' ? 'missingAssets' : 'failedAssets']++;
    assert.equal(asset.file, null, `Unavailable asset has a file: ${assetKey}`);
    continue;
  }
  actual.downloadedAssets++;
  const keyHash = digest(Buffer.from(assetKey, 'utf8'));
  assert.equal(asset.file, `files/${keyHash.slice(0, 2)}/${keyHash}.webp`, `Unsafe/colliding filename: ${assetKey}`);
  assert.ok(!files.has(asset.file), `Duplicate file path: ${assetKey}`);
  files.add(asset.file);
  const absolute = path.resolve(root, asset.file);
  assert.ok(absolute.startsWith(root + path.sep));
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, asset.bytes, `Size mismatch: ${assetKey}`);
  assert.equal(digest(bytes), asset.sha256, `SHA-256 mismatch: ${assetKey}`);
  assert.deepEqual(webpSize(bytes), [asset.width, asset.height], `Dimensions differ: ${assetKey}`);
  actual.totalBytes += bytes.length;
}

const expectedRecords = new Set(), expectedAssets = new Set();
const primaryKeys = { biome_desc: 'biome_type', building_map_icon_desc: 'building_id', enemy_desc: 'enemy_type', npc_desc: 'npc_type' };
const fields = new Set(['icon_asset_name', 'icon_address', 'icon_path', 'icon_asset_path', 'icon_unicode']);
for (const meta of source.tables) {
  const iconFields = meta.fields.filter(field => fields.has(field));
  if (!iconFields.length) continue;
  assert.equal(iconFields.length, 1, `Multiple icon fields need review: ${meta.table}`);
  const tableBytes = await readFile(path.join(dataRoot, meta.path));
  assert.equal(digest(tableBytes), meta.sha256, `Raw source changed: ${meta.table}`);
  const idField = primaryKeys[meta.table] || 'id';
  for (const row of JSON.parse(tableBytes.toString('utf8'))) {
    const recordKey = `${meta.table}:${row[idField]}`;
    const record = bindings.records[recordKey];
    expectedRecords.add(recordKey);
    assert.ok(record, `Missing record binding: ${recordKey}`);
    assert.equal(record.id, row[idField]);
    assert.equal(record.idField, idField);
    assert.equal(record.table, meta.table);
    assert.equal(record.field, iconFields[0]);
    const value = row[iconFields[0]] || '';
    assert.equal(record.sourceValue, Object.hasOwn(row, iconFields[0]) ? row[iconFields[0]] : '', `Source icon differs: ${recordKey}`);
    const kind = !value ? 'empty' : value.includes('/') ? 'image' : 'glyph';
    assert.equal(record.kind, kind);
    actual.records++;
    actual[`${kind}Records`]++;
    const tableCounts = actual.byTable[meta.table] ??= { records: 0, available: 0, missing: 0, failed: 0, glyph: 0, empty: 0 };
    tableCounts.records++;
    tableCounts[record.status]++;
    if (kind !== 'image') {
      assert.equal(record.status, kind);
      assert.equal(record.assetKey, null);
      assert.equal(record.file, null);
      assert.deepEqual(record.variants, []);
      continue;
    }
    const match = value.match(/^([\w/]+)\[((?:,\d+)+)\]$/);
    const base = match ? match[1] : value;
    const variants = match ? [...new Set(match[2].split(',').filter(Boolean).map(Number))].sort((a, b) => a - b).map(minQuantity => ({ minQuantity, assetKey: `${base}${minQuantity}` })) : [];
    assert.equal(record.assetKey, base);
    assert.deepEqual(record.variants, variants, `Quantity variants differ: ${recordKey}`);
    for (const key of [base, ...variants.map(variant => variant.assetKey)]) {
      expectedAssets.add(key);
      assert.ok(Object.hasOwn(manifest.assets, key), `Missing asset: ${key}`);
    }
    const asset = manifest.assets[base];
    assert.equal(record.file, asset.file);
    assert.equal(record.status, asset.status === 'downloaded' ? 'available' : asset.status);
  }
}
assert.deepEqual(Object.keys(bindings.records).sort(), [...expectedRecords].sort(), 'Record coverage differs');
assert.deepEqual(Object.keys(manifest.assets).sort(), [...expectedAssets].sort(), 'Asset coverage differs');
for (const [entityKey, recordKey] of Object.entries(bindings.byEntity)) assert.ok(bindings.records[recordKey], `Broken alias: ${entityKey}`);
for (const [table, alias] of [['item_desc', 'item'], ['cargo_desc', 'cargo'], ['resource_desc', 'resource'], ['building_desc', 'building']]) {
  for (const [recordKey, record] of Object.entries(bindings.records)) {
    if (record.table === table) assert.equal(bindings.byEntity[`${alias}:${record.id}`], recordKey);
  }
}
assert.deepEqual(actual, manifest.counts, 'Manifest counts differ');
const unavailableAssets = Object.entries(manifest.assets).filter(([, asset]) => asset.status !== 'downloaded').map(([assetKey, asset]) => ({ assetKey, ...asset }));
const unavailableRecords = Object.entries(bindings.records).filter(([, record]) => record.status !== 'available').map(([recordKey, record]) => ({ recordKey, ...record }));
assert.deepEqual(missing.assets, unavailableAssets, 'Missing asset report differs');
assert.deepEqual([...missing.records].sort((a, b) => a.recordKey.localeCompare(b.recordKey)), unavailableRecords.sort((a, b) => a.recordKey.localeCompare(b.recordKey)), 'Missing binding report differs');
const diskFiles = (await readdir(path.join(root, 'files'), { recursive: true })).filter(file => file.endsWith('.webp'));
assert.equal(diskFiles.length, files.size, 'Unlisted WebP files found (possibly from a previous snapshot)');
console.log(`PASS: ${actual.downloadedAssets} WebP files; SHA-256, RIFF, dimensions, bindings, quantity variants, source coverage and reports verified.`);
console.log(`${actual.missingAssets} missing upstream assets; ${actual.failedAssets} failed requests; ${actual.glyphRecords} font glyph references; ${actual.emptyRecords} empty references.`);
console.log(`${actual.totalBytes.toLocaleString('en-US')} bytes stored locally. Snapshot: ${source.source.commit}`);
assert.equal(actual.failedAssets, 0, 'Transient/network failures remain; rerun the downloader');
