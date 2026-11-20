const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, launchBrowser, catalogName } = require('./browser-runtime.cjs');

(async () => {
  await fs.mkdir('output', { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const sidebar = page.getByRole('navigation', { name: 'Разделы сайта' });
    const tab = name => page.getByRole('tab', { name, exact: true });
    const detail = page.locator('#world-detail');
    const search = page.locator('#world-search');
    const results = page.locator('#world-results');
    const openWorld = () => sidebar.getByRole('button', { name: 'Мир', exact: true }).click();
    const worldHeading = name => detail.getByRole('heading', { name: catalogName(name) }).waitFor();
    const selectEntry = async (query, id, name) => {
      await search.fill(query);
      await results.locator(`button[data-id="${id}"]`).click();
      await worldHeading(name);
    };

    await page.goto(appURL());
    await openWorld();
    await tab('Достижения').waitFor();
    assert.equal(await tab('Достижения').getAttribute('aria-selected'), 'true');
    assert.equal(await results.locator('.world-result').count(), 12);
    assert.match(await results.getByRole('status').textContent(), /254.*1 из 22/);
    await results.getByRole('button', { name: 'Далее' }).click();
    assert.match(await results.getByRole('status').textContent(), /страница 2 из 22/);
    assert.equal(await results.locator('.world-result').first().evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Сортировка').selectOption('points-desc');
    assert.match(await results.locator('.world-result').first().textContent(), /25\s*000 очк\./);
    await search.fill('nonexistent achievement');
    await results.getByText(/Ничего не найдено/).waitFor();
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
    assert.equal(await search.inputValue(), '');

    await page.getByLabel('Условия').selectOption('9');
    await selectEntry('Hunter’s First Steps', 7, "Hunter's First Steps");
    await detail.getByRole('button', { name: /\(Hunting\) · уровень 2/ }).click();
    await page.locator('#guide-detail').getByRole('heading', { name: catalogName("Hunting") }).waitFor();
    assert.equal(await page.locator('[data-guide-level]').inputValue(), '1');
    assert.match(await page.locator('.guide-current-level').textContent(), /уровень 2/);
    await openWorld();
    await detail.getByRole('button', { name: catalogName("Flint Bow") }).click();
    await page.locator('.recipe-target-heading').getByRole('heading', { name: catalogName("Flint Bow") }).waitFor();
    await page.goBack();
    await worldHeading("Hunter's First Steps");
    await page.goForward();
    await page.locator('.recipe-target-heading').getByRole('heading', { name: catalogName("Flint Bow") }).waitFor();

    await openWorld();
    await page.getByLabel('Условия').selectOption('');
    await selectEntry('The Landweaver', 1930173963, 'The Landweaver');
    for (const name of ['Adept Farmer', 'Adept Tailor', 'Adept Forager']) {
      await detail.getByRole('button', { name: catalogName(name) }).waitFor();
    }
    await page.getByLabel('Условия').selectOption('exploration');
    await selectEntry('World Explorer II', 141819081, 'World Explorer II');
    assert.match(await detail.innerText(), /Открыть участки мира · 1\s440/);
    await detail.getByRole('button', { name: catalogName("World Explorer I") }).click();
    await worldHeading('World Explorer I');
    await detail.getByRole('button', { name: catalogName("World Explorer II") }).waitFor();

    await page.getByLabel('Условия').selectOption('');
    await selectEntry('Apprentice Forester', 67, 'Journeyman Forester');
    assert.equal(await detail.locator('.world-rewards li').count(), 7);
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
    await detail.locator('img[data-entity-image="item:11014"]').first().evaluate(img => img.decode());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/world-achievements-1420.png', fullPage: true });

    await tab('Достижения').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Биомы').evaluate(el => el === document.activeElement), true);
    await selectEntry('спокойный лес', 1, 'Calm Forest');
    await detail.locator('.world-card-top img[data-entity-image="biome:1"]').waitFor();
    await detail.getByRole('button', { name: catalogName("Survey the Lake") }).click();
    await worldHeading('Survey the Lake');
    await detail.locator('.world-card-top img[data-entity-image="biome:1"]').evaluate(img => img.decode());
    await detail.getByRole('button', { name: catalogName("Lake Point of Interest") }).click();
    await page.locator('.resource-target-heading').getByRole('heading', { name: catalogName("Lake Point of Interest") }).waitFor();
    assert.equal(new URL(page.url()).hash, '#/resources/game/resource%3A1352550205');

    const lakeBiome = page.locator('.biome-details');
    assert.match(await lakeBiome.innerText(), /Через разведку/);
    await lakeBiome.getByRole('button', { name: /Calm Forest/ }).click();
    await worldHeading('Calm Forest');
    await tab('Разведка').click();
    await page.getByLabel('Биом').selectOption('2');
    await selectEntry('Swift Cervus Tracking', 192697986, 'Swift Cervus Tracking');
    const creature = detail.getByRole('button', { name: catalogName("Swift Cervus") });
    await creature.click();
    await page.locator('.resource-target-heading').getByRole('heading', { name: catalogName("Swift Cervus") }).waitFor();
    assert.equal(new URL(page.url()).hash, '#/resources/creatures/enemy%3A42');

    await openWorld();
    await page.getByLabel('Биом').selectOption('1');
    await selectEntry('Survey the Lake', 1249466124, 'Survey the Lake');
    for (const width of [1280, 760, 530, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 1100 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `World overflow at ${width}px`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `output/world-prospecting-${width}.png`, fullPage: true });
    }
    await page.goto(appURL('#/world/achievements/999999999'));
    await worldHeading('Запись не найдена в снимке');
    await page.goto(appURL('#/recipes/item%3A400827528'));
    await page.locator('.recipe-target-heading').getByRole('heading', { name: catalogName("Rangifer Antler") }).waitFor();
    await page.locator('.biome-details').getByRole('button', { name: /Misty Tundra/ }).waitFor();
    const source = page.locator('#recipe-acquisition [data-recipe-details="enemy:9"]');
    await source.locator('summary').first().click();
    await source.locator('.biome-method').getByRole('button', { name: /Misty Tundra/ }).waitFor();
    await page.setViewportSize({ width: 1420, height: 1050 });
    await page.goto(appURL('#/resources/creatures/enemy%3A9'));
    await page.locator('.biome-details').getByRole('button', { name: /Misty Tundra/ }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/resource-biomes-1420.png', fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: world catalogue, linked achievements, biomes, prospecting targets, navigation and responsive layouts');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
