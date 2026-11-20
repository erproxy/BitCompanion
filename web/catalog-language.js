import { currentLanguage, t } from './i18n.js';
import { RARITIES } from './domain.js';
import { catalogLocales, gameLanguageFile } from './catalog-locales.js';
import { appBase, assetUrl, runtimeConfig } from './runtime-config.js';

let russian = {};
let dictionaryVersion = 0;
let official = new Map();
const requests = new Map();
const importCache = 'bitcraft-companion-imported-localizations';
const importURL = new URL('imported-game-localization.json', appBase).href;
const importLimit = 24 * 1024 * 1024;

export const canImportCatalogLanguages = Boolean(runtimeConfig.catalogCommit && !runtimeConfig.gameLocalization && globalThis.caches);

function importedDictionaries(pack) {
  const invalid = () => new Error(t('Выбери файл catalog.json, созданный импортом переводов из Steam.'));
  if (pack?.formatVersion !== 1 || typeof pack.steamBuild !== 'string' || !/^\d+$/.test(pack.steamBuild)
    || !pack.languages || typeof pack.languages !== 'object' || Array.isArray(pack.languages)) throw invalid();
  if (pack.commit !== runtimeConfig.catalogCommit) throw new Error(t('Версия перевода каталога не совпадает со снимком.'));
  const languages = Object.entries(pack.languages);
  if (!languages.length) throw invalid();
  for (const [language, dictionary] of languages) {
    if (!Object.hasOwn(catalogLocales, language) || !catalogLocales[language].asset
      || !dictionary?.strings || typeof dictionary.strings !== 'object' || Array.isArray(dictionary.strings)) throw invalid();
    const values = Object.values(dictionary.strings);
    if (!values.length || values.some(text => typeof text !== 'string' || !text.trim() || /[<>]/.test(text))) throw invalid();
  }
  return new Map(languages.map(([language, dictionary]) => [language, dictionary.strings]));
}

function useImportedDictionaries(dictionaries) {
  official = dictionaries;
  dictionaryVersion++;
  return [...official.keys()];
}

export async function restoreCatalogLanguages() {
  if (!canImportCatalogLanguages) return [];
  try {
    const response = await caches.match(importURL, { cacheName: importCache });
    if (response) return useImportedDictionaries(importedDictionaries(await response.json()));
  } catch { /* A missing or stale import must not prevent the app from opening. */ }
  return [];
}

export async function importCatalogLanguages(file) {
  if (file.size > importLimit) throw new Error(t('Словарь больше 24 МБ.'));
  const content = await file.text();
  let pack;
  try { pack = JSON.parse(content); }
  catch { throw new Error(t('Выбери файл catalog.json, созданный импортом переводов из Steam.')); }
  const dictionaries = importedDictionaries(pack);
  try {
    const cache = await caches.open(importCache);
    await cache.put(importURL, new Response(content, { headers: { 'Content-Type': 'application/json' } }));
  } catch { throw new Error(t('Браузер не сохранил словарь. Проверь доступ к хранилищу сайта.')); }
  return useImportedDictionaries(dictionaries);
}

export function installCatalogLanguage(pack, commit) {
  if (!pack || pack.commit !== commit || !pack.strings || typeof pack.strings !== 'object' || Array.isArray(pack.strings))
    throw Error(t('Версия перевода каталога не совпадает со снимком.'));
  if (pack.language) {
    if (!Object.hasOwn(catalogLocales, pack.language) || !catalogLocales[pack.language].asset) throw Error('Invalid BitCraft translation language');
    official.set(pack.language, pack.strings);
  } else {
    russian = pack.strings;
  }
  dictionaryVersion++;
}

export function loadOfficialCatalogLanguage(language) {
  const config = runtimeConfig.gameLocalization;
  if (!config?.languages.includes(language) || official.has(language)) return;
  if (!requests.has(language)) {
    const request = fetch(assetUrl(gameLanguageFile(language)), { signal: AbortSignal.timeout(8000) })
      .then(response => {
        if (!response.ok) throw Error('HTTP ' + response.status);
        return response.json();
      })
      .then(pack => {
        if (pack.language !== language) throw Error('Unexpected BitCraft translation language');
        installCatalogLanguage(pack, config.commit);
      })
      .finally(() => requests.delete(language));
    requests.set(language, request);
  }
  return requests.get(language);
}

const lookup = (dictionary, name) => dictionary && Object.hasOwn(dictionary, name) ? dictionary[name] : undefined;
const officialText = (name, language = currentLanguage()) => lookup(official.get(language), name);

export function gameText(original) {
  const text = String(original ?? '');
  return officialText(text.trim()) ?? (currentLanguage() === 'ru' ? lookup(russian, text.trim()) ?? text.trim() : text);
}

export function gameName(original, curatedRussian) {
  const name = String(original ?? '').trim();
  if (!name || currentLanguage() === 'en') return name;
  const translated = officialText(name) ?? (currentLanguage() === 'ru' ? curatedRussian || lookup(russian, name) : undefined);
  return translated && translated !== name ? `${translated} (${name})` : name;
}

const rarities = new Map(RARITIES.map(entry => [entry.en, entry.name]));
export const rarityName = original => officialText(original) ??
  (currentLanguage() === 'ru' ? rarities.get(original) ?? lookup(russian, original) ?? original : original);

export const searchable = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replaceAll('ё', 'е');
export const catalogSearchKey = () => currentLanguage() + '/' + dictionaryVersion;
export function gameSearch(...values) {
  return searchable(values.flatMap(value => {
    const name = String(value ?? '').trim();
    return [name, officialText(name), officialText(name, 'ru'), lookup(russian, name)];
  }).filter(Boolean).join(' '));
}
