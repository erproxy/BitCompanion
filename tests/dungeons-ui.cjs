const assert = require('node:assert/strict');
const { launchBrowser, baseURL, appURL, catalogName } = require('./browser-runtime.cjs');

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    const isWeb = await page.locator('[data-web-update]').count() > 0;
    const tab = page.getByRole('button', { name: 'Данжи', exact: true });
    const heading = page.locator('#dungeon-heading');
    const search = page.getByRole('searchbox', { name: 'Поиск данжа' });
    const results = page.locator('#dungeon-results');
    const result = id => results.locator(`[data-id="${id}"]`);
    const select = id => result(id).click();

    await tab.click();
    await heading.waitFor();
    assert.equal(await results.getByRole('button').count(), 4);
    await search.fill('SENTINEL DUNGEON');
    assert.equal(await results.getByRole('button').count(), 1);
    await result(208697589).focus();
    await result(208697589).press('Enter');
    assert.equal(await heading.textContent(), 'Арсенал Искателей звёзд (Starseeker Armory)');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'dungeon-detail');
    assert.equal(await page.locator('.dungeon-route > li').count(), 7);
    await search.fill('запись, которой нет');
    await results.getByText('Ничего не найдено.', { exact: false }).waitFor();
    await search.fill('');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/dungeons-armory-1420.png', fullPage: true });

    await select(853770752);
    const conditions = page.getByText('Условия открытия проходов', { exact: true });
    await conditions.click();
    await page.getByText(/\(Unlit Torch\) × 4/).waitFor();
    await page.getByRole('button', { name: catalogName("Immortal Watcher") }).last().click();
    await page.locator('body[data-tab="resources"] .resource-target-heading h2').filter({ hasText: 'Immortal Watcher' }).waitFor();
    if (isWeb) assert.match(page.url(), /#\/resources\/creatures\/enemy%3A59$/);
    await page.locator('.resource-sources').getByText('Награды за вклад в данжах', { exact: false }).click();
    await page.locator('.resource-sources [data-action="dungeon-target"][data-id="853770752"]').click();
    assert.equal(await heading.textContent(), 'Заброшенный аванпост Бессмертных (Abandoned Immortal Outpost)');

    await select(1785852446);
    assert.match(await page.locator('.dungeon-facts').innerText(), /1 мин[\s\S]*3 мин/);
    await page.getByRole('link', { name: 'патчноуте 1.0' }).waitFor();
    assert.equal(await page.locator('#dungeon-detail [data-action="drop-from-catalog"]').count(), 0);
    const shell = page.getByRole('button', { name: catalogName("Ancient Skitch Shell") });
    await shell.click();
    await page.locator('.recipe-target-heading h2').filter({ hasText: 'Ancient Skitch Shell' }).waitFor();
    const dungeonSources = page.locator('#recipe-acquisition').getByText('Получить в данжах', { exact: false });
    await dungeonSources.click();
    await page.locator('#recipe-acquisition [data-action="dungeon-target"][data-id="1785852446"]').click();
    assert.equal(await heading.textContent(), 'Данж гигантского скитча (Giant Skitch Dungeon)');

    if (isWeb) {
      assert.match(page.url(), /#\/dungeons\/1785852446$/);
      await page.goBack();
      await page.locator('.recipe-target-heading h2').filter({ hasText: 'Ancient Skitch Shell' }).waitFor();
      await page.goForward();
      await heading.filter({ hasText: 'Данж гигантского скитча' }).waitFor();
      await page.goto(appURL('#/dungeons/9000'));
      await page.getByRole('heading', { name: 'Данж не найден в снимке' }).waitFor();
      await page.goto(appURL('#/dungeons/1785852446'));
      await heading.filter({ hasText: 'Данж гигантского скитча' }).waitFor();
    }

    for (const [width, height] of [[1280, 900], [760, 1100], [530, 1100], [390, 844], [360, 800]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No page overflow at ${width}px`);
      if ([1280, 760, 530, 360].includes(width)) await page.screenshot({ path: `output/dungeons-skitch-${width}.png`, fullPage: true });
    }

    const oldExport = { version: 1, tab: 'drops', recipeBook: { inventory: { 'item:1': 12 } } };
    await page.locator('#import-file').setInputFiles({ name: 'old-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldExport)) });
    await page.waitForSelector('body[data-tab="drops"]');
    await tab.click();
    await heading.filter({ hasText: 'Арсенал Искателей звёзд' }).waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bitcraft-companion-v1')));
    assert.equal(stored.recipeBook.inventory['item:1'], 12);
    assert.deepEqual(stored.dungeons, { id: 0, search: '' });
    assert.deepEqual(errors, []);
    console.log('PASS: dungeon search, routes and conditions, boss and item links, timers, old saves and responsive layout.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
