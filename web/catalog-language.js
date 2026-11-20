import { currentLanguage, t } from './i18n.js';
import { RARITIES } from './domain.js';

let dictionary = {};

export function installCatalogLanguage(pack, commit) {
  if (pack?.commit !== commit || !pack?.strings || typeof pack.strings !== 'object') throw Error(t('Версия перевода каталога не совпадает со снимком.'));
  dictionary = pack.strings;
}

export function russianText(original) {
  const name = String(original ?? '').trim();
  return Object.hasOwn(dictionary, name) ? dictionary[name] : name;
}

export function gameText(original) {
  return currentLanguage() === 'ru' ? russianText(original) : String(original ?? '');
}

export function gameName(original, curatedRussian) {
  const name = String(original ?? '').trim();
  if (!name || currentLanguage() === 'en') return name;
  const russian = curatedRussian || russianText(name);
  return russian && russian !== name ? `${russian} (${name})` : name;
}

const rarities = new Map(RARITIES.map(entry => [entry.en, entry.name]));
export const rarityName = original => currentLanguage() === 'ru' ? rarities.get(original) ?? russianText(original) : original;

export const searchable = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replaceAll('ё', 'е');
export const gameSearch = (...values) => searchable(values.flatMap(value => [value, russianText(value)]).filter(Boolean).join(' '));
