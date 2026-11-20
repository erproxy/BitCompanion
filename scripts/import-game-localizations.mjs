import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogLocales } from '../web/catalog-locales.js';
import { DROPS, RARITIES } from '../web/domain.js';
import { collectCatalogStrings } from './catalog-localization.mjs';
import { readUnityTextAssets } from './read-unity-text-assets.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const runtimePath = '{UnityEngine.AddressableAssets.Addressables.RuntimePath}';
const sourceFile = 'data/bitcraft/localization/catalog.json';
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));

function localeBundles(catalog) {
  const locales = new Map();
  const assetsById = new Map();
  for (const [locale, { asset }] of Object.entries(catalogLocales)) {
    if (!asset) continue;
    const id = catalog.m_InternalIds.findIndex(value => value.endsWith('/I18N/' + asset + '.csv'));
    if (id < 0) continue;
    locales.set(locale, asset);
    assetsById.set(id, asset);
  }
  if (locales.size === 0) throw new Error('The BitCraft client has no recognized I18N CSV assets');

  const entries = Buffer.from(catalog.m_EntryDataString, 'base64');
  const buckets = Buffer.from(catalog.m_BucketDataString, 'base64');
  const count = entries.readUInt32LE(0);
  const entrySize = 7 * 4;
  if (4 + count * entrySize !== entries.length) throw new Error('Unsupported Unity Addressables catalog');
  const bundleKeys = new Map();
  for (let at = 4; at < entries.length; at += entrySize) {
    const asset = assetsById.get(entries.readInt32LE(at));
    if (asset) {
      const key = entries.readInt32LE(at + 8);
      if (!bundleKeys.has(key)) bundleKeys.set(key, new Set());
      bundleKeys.get(key).add(asset);
    }
  }

  const bundles = new Map();
  const keyCount = buckets.readUInt32LE(0);
  for (let key = 0, at = 4; key < keyCount; key++) {
    const length = buckets.readUInt32LE(at + 4);
    at += 8;
    const assets = bundleKeys.get(key);
    if (assets) {
      for (let i = 0; i < length; i++) {
        const entry = buckets.readUInt32LE(at + i * 4);
        const internalId = entries.readUInt32LE(4 + entry * entrySize);
        const location = catalog.m_InternalIds[internalId];
        if (!location?.startsWith(runtimePath)) continue;
        const file = location.slice(runtimePath.length).replaceAll('\\', '/').replace(/^\//, '');
        if (!/^(?:[\w-]+\/)*[\w-]+\.bundle$/.test(file)) continue;
        if (!bundles.has(file)) bundles.set(file, new Set());
        for (const name of assets) bundles.get(file).add(name);
      }
    }
    at += length * 4;
  }
  return { locales, bundles };
}

function projectTranslations(bytes, wanted) {
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const translations = new Map();
  let quoted = false;
  let field = '';
  let row = [];
  let rowNumber = 0;
  function finishRow() {
    row.push(field.replace(/\r$/, ''));
    rowNumber++;
    if (rowNumber === 1) {
      if (row.join(',') !== 'index,source,translation,validated') throw new Error('Unexpected localization CSV header');
    } else if (row.length === 4) {
      const source = row[1].trim();
      const translated = row[2].trim();
      if (wanted.has(source) && translated) translations.set(source, translated);
    } else if (row.length !== 1 || row[0]) {
      throw new Error('Malformed localization CSV row ' + rowNumber);
    }
    row = [];
    field = '';
  }

  for (let i = 0; i < csv.length; i++) {
    const character = csv[i];
    if (character === '"' && quoted && csv[i + 1] === '"') {
      field += '"';
      i++;
    } else if (character === '"' && (quoted || !field)) {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && character === '\n') {
      finishRow();
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('Unclosed quotation in localization CSV');
  if (row.length || field) finishRow();
  if (!translations.size) throw new Error('The game translation has no matches in the Companion catalog');
  return Object.fromEntries([...wanted].filter(source => translations.has(source)).map(source => [source, translations.get(source)]));
}

async function readCompanionCatalog() {
  try {
    return await json(path.join(projectRoot, 'web/data/recipe-catalog.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return json(path.join(projectRoot, 'data/public/recipe-catalog.json'));
  }
}

async function importLocalizations(client) {
  const addressables = path.join(client, 'BitCraft_Data/StreamingAssets/aa');
  const steamManifest = await readFile(path.resolve(client, '../../appmanifest_3454650.acf'), 'utf8');
  const build = steamManifest.match(/"buildid"\s+"(\d+)"/)?.[1];
  if (!build || !/"appid"\s+"3454650"/.test(steamManifest)) throw new Error('Expected the BitCraft Online Steam manifest');
  const addressCatalog = await json(path.join(addressables, 'catalog.json'));
  const { locales, bundles } = localeBundles(addressCatalog);
  const assets = new Map();
  for (const [file, names] of bundles) {
    const missing = new Set([...names].filter(name => !assets.has(name)));
    if (!missing.size) continue;
    for (const [name, csv] of readUnityTextAssets(path.join(addressables, file), missing)) assets.set(name, csv);
  }

  const catalog = await readCompanionCatalog();
  const wanted = new Set([
    ...collectCatalogStrings(catalog), ...DROPS.map(preset => preset.en), ...RARITIES.map(rarity => rarity.en),
    ...catalog.world.biomes.map(biome => biome.hazard).filter(Boolean)
  ]);
  const languages = {};
  for (const [locale, asset] of locales) {
    const bytes = assets.get(asset);
    if (!bytes) throw new Error('I18N/' + asset + '.csv is missing from the installed bundles');
    const strings = projectTranslations(bytes, wanted);
    languages[locale] = { sha256: createHash('sha256').update(bytes).digest('hex'), strings };
    console.log(locale + ': ' + Object.keys(strings).length + ' matching catalog translations');
  }

  const filename = path.join(projectRoot, sourceFile);
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.tmp-' + randomUUID();
  try {
    await writeFile(temporary, JSON.stringify({ formatVersion: 1, steamBuild: build, commit: catalog.source.commit, languages }) + '\n', { flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log('Imported ' + locales.size + ' official BitCraft translations from Steam build ' + build + ' into ' + sourceFile);
}

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/import-game-localizations.mjs "path to Steam\\steamapps\\common\\BitCraft Online"');
  await importLocalizations(path.resolve(process.argv[2]));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
