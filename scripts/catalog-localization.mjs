import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { russianCatalogText } from './catalog-ru-glossary.mjs';

// The dictionaries only cover text presented in the catalogue. Identifiers,
// rules, URLs, and user-supplied names remain in their original form.
const fields = new Set(['name', 'title', 'description', 'tag', 'category', 'action', 'locationLabel', 'displayName', 'traveler']);
export function collectCatalogStrings(catalog) {
  const strings = new Set();
  const add = value => {
    if (typeof value === 'string' && /[a-z]/i.test(value) && !/\p{Script=Cyrillic}/u.test(value)) strings.add(value.trim());
  };
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, part] of Object.entries(value)) {
      if (fields.has(key)) add(part);
      visit(part);
    }
  }
  for (const section of ['entities', 'recipes', 'guide', 'world', 'dungeons', 'drops']) visit(catalog[section]);
  for (const source of catalog.drops.sources) {
    add(source.quest?.[1]);
    add(source.quest?.[3]);
  }
  for (const dungeon of catalog.dungeons) for (const room of dungeon.rooms) {
    for (const condition of room.conditions) [...condition.required, ...condition.removes].forEach(add);
  }
  return [...strings].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const read = async filename => JSON.parse(await readFile(new URL(filename, import.meta.url), 'utf8'));
  const catalog = await read('../web/data/recipe-catalog.json');
  const strings = collectCatalogStrings(catalog);
  const output = '../web/data/catalog-ru.json';
  if (process.argv[2] === '--collect' && process.argv[3]) {
    await writeFile(process.argv[3], JSON.stringify({ commit: catalog.source.commit, strings }) + '\n');
    console.log(`${strings.length} unique catalog strings to localize.`);
  } else if (process.argv[2] === '--build' && process.argv[3]) {
    const draft = JSON.parse(await readFile(process.argv[3], 'utf8'));
    assert.equal(draft.commit, catalog.source.commit);
    const translations = Object.fromEntries(strings.map(key => {
      const value = russianCatalogText(key, draft.strings);
      assert.ok(typeof value === 'string' && value.trim(), `Missing Russian catalog string: ${key}`);
      return [key, value];
    }));
    await writeFile(new URL(output, import.meta.url), JSON.stringify({ commit: draft.commit, model: draft.model, strings: translations }) + '\n');
    console.log(`Built the Russian catalog with ${strings.length} entries.`);
  } else if (process.argv[2] === '--check') {
    const { commit, strings: translations } = await read(output);
    assert.equal(commit, catalog.source.commit);
    assert.deepEqual(Object.keys(translations).sort(), strings, 'The dictionary should cover the entire pinned catalogue');
    assert.ok(Object.values(translations).every(value => typeof value === 'string' && value.trim().length > 0));
    console.log(`PASS: ${strings.length} Russian catalog strings for ${commit.slice(0, 9)}.`);
  } else {
    throw Error('Use --collect FILE, --build DRAFT or --check');
  }
}
