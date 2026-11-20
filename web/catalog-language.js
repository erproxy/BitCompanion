import { currentLanguage, t } from './i18n.js';
import { RARITIES } from './domain.js';
import { catalogLocales, gameLanguageFile } from './catalog-locales.js';
import { assetUrl, runtimeConfig } from './runtime-config.js';

let russian = {};
let dictionaryVersion = 0;
const official = new Map();
const requests = new Map();

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
