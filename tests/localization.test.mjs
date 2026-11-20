import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { catalogDirectory } from './catalog-fixture.mjs';
import { collectCatalogStrings } from '../scripts/catalog-localization.mjs';
import { gameName, gameSearch, gameText, installCatalogLanguage } from '../web/catalog-language.js';
import { formatDate, formatNumber, resolveLanguage, setLanguage, t } from '../web/i18n.js';
import { messagesEn } from '../web/messages-en.js';

test('system language follows supported preferences with English fallback', () => {
  assert.equal(resolveLanguage('system', ['ru-RU', 'en']), 'ru');
  assert.equal(resolveLanguage('system', ['en-GB', 'ru']), 'en');
  assert.equal(resolveLanguage('system', ['fr-CA', 'ru-RU']), 'ru');
  assert.equal(resolveLanguage('system', ['fr-CA']), 'en');
  assert.equal(resolveLanguage('en', ['ru']), 'en');
  assert.equal(resolveLanguage('ru', ['en']), 'ru');
});

test('English messages preserve data interpolation and display conventions', () => {
  const fields = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [source, translated] of Object.entries(messagesEn)) {
    assert.match(translated, /\S/);
    assert.deepEqual(fields(translated), fields(source), source);
  }
  setLanguage('en');
  assert.equal(t('«{0}» · {1} не меньше {2}', 'Мой текст', 'drops', 5), '“Мой текст” · at least 5 drops');
  assert.equal(formatNumber(1234.5, 2), '1,234.5');
  assert.equal(formatDate('2026-11-13'), '11/13/2026');
  setLanguage('ru');
  assert.equal(formatDate('2026-11-13'), '13.11.2026');
  assert.equal(formatNumber(1234.5, 2).replace(/\s/g,' '), '1 234,5');
});

test('all catalog strings have an offline dictionary entry and public names have Russian labels', async () => {
  const json = async file => JSON.parse(await readFile(new URL(file, catalogDirectory), 'utf8'));
  const [catalog, pack] = await Promise.all([json('recipe-catalog.json'), json('catalog-ru.json')]);
  assert.deepEqual(Object.keys(pack.strings).sort(), collectCatalogStrings(catalog));
  assert.throws(() => installCatalogLanguage(pack, 'other-snapshot'));
  installCatalogLanguage(pack, catalog.source.commit);
  const visibleNames = [
    ...catalog.entities.filter(entity => entity.visible),
    ...catalog.recipes.filter(method => !method.internalResolver),
    ...catalog.guide.quests,
    ...catalog.guide.quests.flatMap(quest => quest.stages),
    ...catalog.world.biomes,
    ...catalog.world.achievements,
    ...catalog.drops.sources
  ].map(record => record.name);
  for (const name of visibleNames.filter(name => typeof name === 'string' && /[A-Za-z]/.test(name))) {
    assert.match(gameText(name), /\p{Script=Cyrillic}/u, name);
  }
  assert.equal(gameName('Rathium Pickaxe'), 'Кирка ратия (Rathium Pickaxe)');
  assert.equal(gameName('Calm Forest', 'Спокойный лес'), 'Спокойный лес (Calm Forest)');
  assert.match(gameSearch('Rathium Pickaxe'), /кирка ратия.*rathium pickaxe|rathium pickaxe.*кирка ратия/);
  setLanguage('en');
  assert.equal(gameName('Rathium Pickaxe'), 'Rathium Pickaxe');
  assert.equal(gameName('Calm Forest', 'Спокойный лес'), 'Calm Forest');
  assert.match(gameSearch('Rathium Pickaxe'), /кирка ратия/);
  setLanguage('ru');
});
