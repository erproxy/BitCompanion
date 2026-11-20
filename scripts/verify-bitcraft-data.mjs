import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../data/bitcraft/', import.meta.url));
const root = path.resolve(process.argv[2] || defaultRoot);
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.formatVersion, 1, 'Unsupported manifest format');
assert.match(manifest.source.commit, /^[0-9a-f]{40}$/, 'Invalid source commit');
assert.equal(manifest.tableCount, manifest.tables.length, 'Table count mismatch');
assert.equal(new Set(manifest.tables.map(table => table.table)).size, manifest.tableCount, 'Duplicate table name');

let totalBytes = 0;
let totalRows = 0;
for (const metadata of [...manifest.tables, manifest.schema]) {
  const absolute = path.resolve(root, metadata.path);
  assert.ok(absolute.startsWith(root + path.sep), `Path escapes data folder: ${metadata.path}`);
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, metadata.bytes, `Size mismatch: ${metadata.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256, `SHA-256 mismatch: ${metadata.path}`);
  const data = JSON.parse(bytes.toString('utf8'));
  totalBytes += bytes.length;
  if (metadata === manifest.schema) {
    assert.ok(data && typeof data === 'object' && !Array.isArray(data), 'Invalid region schema');
    continue;
  }
  assert.ok(Array.isArray(data), `Expected table array: ${metadata.path}`);
  assert.equal(data.length, metadata.rows, `Row count mismatch: ${metadata.path}`);
  assert.ok(data.every(row => row && typeof row === 'object' && !Array.isArray(row)), `Invalid row: ${metadata.path}`);
  const fields = [...new Set(data.flatMap(row => Object.keys(row)))].sort();
  assert.deepEqual(fields, metadata.fields, `Field list mismatch: ${metadata.path}`);
  const ids = data.filter(row => Object.hasOwn(row, 'id')).map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, `Duplicate id: ${metadata.path}`);
  totalRows += data.length;
}
assert.equal(totalRows, manifest.totalRows, 'Total row count mismatch');
assert.equal(totalBytes, manifest.totalBytes, 'Total byte count mismatch');
const staticFiles = (await readdir(path.join(root, 'raw', 'static'))).filter(file => file.endsWith('.json')).sort();
assert.deepEqual(staticFiles, manifest.tables.map(table => path.basename(table.path)).sort(), 'Static files differ from manifest');
const required = ['crafting_recipe_desc', 'construction_recipe_desc', 'extraction_recipe_desc', 'deconstruction_recipe_desc', 'item_conversion_recipe_desc', 'item_desc', 'cargo_desc', 'item_list_desc', 'building_desc', 'skill_desc', 'tool_desc'];
for (const name of required) assert.ok(manifest.tables.some(table => table.table === name), `Missing required table: ${name}`);

console.log(`PASS: ${manifest.tableCount} tables, ${totalRows.toLocaleString('en-US')} rows, ${totalBytes.toLocaleString('en-US')} bytes; JSON, SHA-256, fields, unique ids and file inventory verified.`);
console.log(`Snapshot: ${manifest.source.commit} (${manifest.source.committedAt})`);
for (const name of required.slice(0, 5)) {
  const table = manifest.tables.find(table => table.table === name);
  console.log(`${name}: ${table.rows.toLocaleString('en-US')} rows`);
}
