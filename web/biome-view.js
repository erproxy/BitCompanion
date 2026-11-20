import { t as tr } from './i18n.js';
import { gameName } from './catalog-language.js';
import { getBiomeLocations, isWorldSource } from './biome-domain.js';
import { getWorldIndex } from './world-domain.js';
import { entityImage } from './entity-images.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function matchingBiomes(book, ids) {
  return getWorldIndex(book).entries.biomes.filter(entry => ids.has(entry.id) || ids.has(entry.symbol));
}

export function biomeLinks(book, ids) {
  const names = matchingBiomes(book, ids);
  return `<span class="biome-links">${names.map(biome => `<button type="button" class="recipe-link biome-link"
    data-action="world-target" data-mode="biomes" data-id="${biome.id}">${entityImage(`biome:${biome.id}`)}
    <span>${escape(gameName(biome.name, biome.title))}</span></button>`).join('')}</span>`;
}

export function biomeListLabel(book, key) {
  const locations = getBiomeLocations(book).byEntity.get(key);
  if (!locations) return '';
  const known = matchingBiomes(book, new Set([...locations.spawn, ...locations.prospecting]));
  if (!known.length) return '';
  const names = known.slice(0, 2).map(biome => gameName(biome.name, biome.title)).join(', ');
  return `${locations.spawn.size ? tr("Биомы") : tr("Разведка")} · ${names}${known.length > 2 ? ` +${known.length - 2}` : ''}`;
}

function locationRows(book, locations) {
  if (!locations) return '';
  const labels = [['spawn', tr("Встречается в")], ['prospecting', tr("Через разведку")]];
  return labels.filter(([kind]) => locations[kind].size).map(([kind, title]) =>
    `<dt>${title}</dt><dd>${biomeLinks(book, locations[kind])}</dd>`).join('');
}

export function entityBiomeDetails(book, entity) {
  const index = getBiomeLocations(book);
  const rows = locationRows(book, index.byEntity.get(entity.key));
  const planted = (book.recipesProducing.get(entity.key) || []).filter(recipe => recipe.kind === 'placement')
    .flatMap(recipe => recipe.requirements.biomes || []);
  const planting = planted.length ? `<dt>${tr("Биомы посадки")}</dt><dd>${biomeLinks(book, new Set(planted))}</dd>` : '';
  if (!rows && !planting && !isWorldSource(entity, index)) return '';
  return `<section class="biome-details" aria-label="${tr("Биомы добычи")}"><h3>${tr("Где искать")}</h3>
    ${rows || planting ? `<dl class="recipe-facts">${rows}${planting}</dl>` : `<p class="subtitle">${tr("Биомы добычи в снимке не указаны.")}</p>`}</section>`;
}

export function methodBiomeDetails(book, recipe) {
  const rows = locationRows(book, getBiomeLocations(book).byMethod.get(recipe.key));
  return rows ? `<dl class="recipe-facts biome-method">${rows}</dl>` : '';
}
