const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, launchBrowser, catalogName } = require('./browser-runtime.cjs');

(async () => {
  await fs.mkdir('output', { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const tab = name => page.getByRole('tab', { name, exact: true });
    const results = page.locator('#drop-results');
    const search = page.locator('#drop-search');
    const source = page.locator('.drop-source');
    const chance = page.locator('output[data-drop-probability]');
    const probability = async () => Number(await chance.getAttribute('data-drop-probability'));
    const choose = id => results.locator(`[data-id="${id}"]`).click();
    const openSide = name => page.getByRole('navigation', { name: 'Разделы сайта' }).getByRole('button', { name, exact: true }).click();

    await page.goto(appURL());
    assert.equal(await tab('Пресеты').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-key="drop.preset"] option').count(), 10);
    await tab('Пресеты').press('ArrowRight');
    assert.equal(await tab('Сбор и рыбалка').getAttribute('aria-selected'), 'true');
    await results.locator('.drop-result').first().waitFor();
    assert.equal(await tab('Сбор и рыбалка').evaluate(node => node === document.activeElement), true);
    assert.equal(await results.locator('.drop-result').count(), 8);
    await results.getByRole('button', { name: 'Далее' }).click();
    assert.match(await results.getByRole('status').textContent(), /страница 2/);
    await search.fill('Rotten Log Rough Tree Bark');
    await choose('extraction:3/item:1010002');
    assert.match(await source.innerText(), /единица прогресса при добыче/);
    await chance.waitFor();
    await page.getByLabel('Тир источника', { exact: true }).selectOption('10');
    await results.getByText(/Ничего не найдено/).waitFor();
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
    assert.equal(await search.inputValue(), '');

    await tab('Обработка').click();
    await search.fill('Прочный хитин');
    const headings = await results.locator('.drop-tier-heading').allTextContents();
    assert.ok(headings.includes('Источники T4') && headings.includes('Источники T6'));
    await page.getByLabel('Тир источника', { exact: true }).selectOption('4');
    assert.equal(await results.locator('.drop-result').count(), 1);
    await choose('conversion:271741003/item:496741270');
    assert.equal(await probability(), 0.005);
    assert.match(await source.innerText(), /Fine Lobster.*T4/);
    await page.getByLabel('Тир источника', { exact: true }).selectOption('6');
    await choose('conversion:1745794600/item:496741270');
    assert.equal(await probability(), 0.01);
    assert.match(await source.innerText(), /Peerless Lobster.*T6/);
    await search.fill('Lobster');
    await results.locator('.drop-result img').first().evaluate(img => img.decode());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/drops-catalog-1420.png', fullPage: true });

    await tab('Существа').click();
    await search.fill('Rangifer Antler');
    await page.getByLabel('Тир предмета', { exact: true }).selectOption('none');
    await choose('enemy:9/item:400827528');
    assert.equal(await probability(), 0.02);
    assert.match(await source.innerText(), /Rangifer.*T4/);
    await source.getByRole('button', { name: 'Открыть источник' }).click();
    await page.locator('.resource-target-heading').getByRole('heading', { name: catalogName("Rangifer") }).waitFor();
    await openSide('Добыча');

    await tab('Сундуки').click();
    await search.fill('Ornate Desert Chest Cooling Energy');
    await choose('chest:22/item:4000');
    assert.equal(await probability(), 0.4375);
    assert.match(await source.innerText(), /До 2 шт. за попытку/);
    await page.getByText('Удачных выдач', { exact: true }).waitFor();
    await search.fill('Spoils of Exploration T2');
    await page.getByLabel('Тир источника', { exact: true }).selectOption('2');
    await choose('chest:19/item:1');
    assert.equal(await probability(), 0.2);
    assert.match(await source.innerText(), /Гарантировано 15 шт./);
    await page.getByText('Выдач с бонусом', { exact: true }).waitFor();

    await tab('Боссы').click();
    await search.fill('Immortal Watcher Mace');
    await choose('contribution:389225043/item:1950453713');
    assert.match(await source.innerText(), /Вклад 90–129/);
    await tab('Квесты').click();
    await search.fill('Lost Coin Purses');
    await choose('quest-drop:911076962:extraction:64/item:1376612754');
    assert.match(await source.innerText(), /Активный квест.*Lost Shipment/);

    await tab('Обработка').click();
    await search.fill('Хитин с хекситом');
    await page.getByLabel('Тир источника', { exact: true }).selectOption('10');
    await choose('conversion:546548972/item:1118112344');
    assert.equal(await probability(), 1 / 251);
    await page.getByRole('button', { name: 'Сохранить план' }).click();
    await tab('Пресеты').click();
    await page.locator('[data-key="drop.preset"]').selectOption('rangifer-antler');
    assert.equal(Number(await page.locator('[data-key="drop.chance"]').inputValue()), 2);
    await page.locator('[data-action="tab"][data-tab="journal"]').click();
    await page.getByRole('button', { name: /Открыть/ }).click();
    assert.equal(await tab('Обработка').getAttribute('aria-selected'), 'true');
    assert.match(await source.innerText(), /Flawless Lobster.*T10/);
    await page.reload();
    assert.equal(await probability(), 1 / 251);

    for (const width of [1280, 760, 530, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 1100 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflows at ${width}px`);
    }
    await search.fill('Хитин с хекситом');
    assert.equal(await chance.textContent(), '0,39841%');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/drops-catalog-360.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: drop tabs, tier filters, pagination, exact chances, receipt units, linked sources, saved plans and narrow layouts.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
