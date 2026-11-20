import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { collectCatalogStrings } from './catalog-localization.mjs';

const filenames = ['recipe-catalog.json', 'catalog-ru.json'];
const publicDirectory = new URL('../data/public/', import.meta.url);
const localDirectory = new URL('../web/data/', import.meta.url);
const check = process.argv[2] === '--check';

if (process.argv.length > (check ? 3 : 2)) {
  throw new Error('Usage: node scripts/build-public-data.mjs [--check]');
}

async function readPair(directory) {
  return Promise.all(filenames.map(file => readFile(new URL(file, directory), 'utf8')));
}

const inputs = await readPair(check ? publicDirectory : localDirectory);
const original = JSON.parse(inputs[0]);
const translated = JSON.parse(inputs[1]);
assert.equal(translated.commit, original.source.commit);

// Keep the catalog graph, requirements, and quantities. The public catalog
// displays names and factual attributes, without the original descriptions.
const catalog = JSON.parse(JSON.stringify(original, (key, value) => key === 'description' ? undefined : value));
const strings = Object.fromEntries(collectCatalogStrings(catalog).map(key => {
  const value = translated.strings[key];
  assert.ok(Object.hasOwn(translated.strings, key) && typeof value === 'string' && value.trim(), 'Missing translation: ' + key);
  return [key, value];
}));
const output = [catalog, { commit: translated.commit, model: translated.model, strings }]
  .map(value => JSON.stringify(value) + '\n');

if (check) {
  assert.deepEqual(inputs, output, 'Public catalog files must contain only the factual projection and its translations.');
  console.log('PASS: public catalog and translation projection.');
} else {
  await mkdir(publicDirectory, { recursive: true });
  await Promise.all(filenames.map((file, index) => writeFile(new URL(file, publicDirectory), output[index])));
  console.log('Built public data for ' + catalog.entities.length + ' entities and ' + catalog.recipes.length + ' acquisition methods.');
}
