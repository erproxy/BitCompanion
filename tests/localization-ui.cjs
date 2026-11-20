const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, launchBrowser } = require('./browser-runtime.cjs');

(async () => {
  await fs.mkdir('output', { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const view = page.locator('#view');
    const language = page.locator('#interface-language');
    const section = id => page.locator(`.nav-item[data-tab="${id}"]`);
    const heading = selector => view.locator(selector).first();
    const bodyIsEnglish = async () => {
      await view.locator('.error').waitFor({ state: 'hidden' });
      const text = await view.innerText();
      assert.ok(!/\p{Script=Cyrillic}/u.test(text), text.match(/.{0,40}\p{Script=Cyrillic}.{0,60}/u)?.[0]);
    };

    await page.goto(appURL());
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await language.inputValue(), 'en');
    assert.deepEqual(await language.locator('option').evaluateAll(options => options.map(option => [option.value, option.text])), [
      ['ru', 'Русский'], ['en', 'English']
    ]);
    assert.equal(await section('drops').innerText(), 'Loot');
    assert.match(await view.locator('.big-result').innerText(), /86\.74/);
    await page.locator('[data-key="drop.attempts"]').fill('321');
    await page.locator('[data-key="drop.attempts"]').press('Tab');
    await page.getByRole('button', { name: 'Save plan' }).click();
    await bodyIsEnglish();

    const sections = [
      ['rarity', '.result-card'], ['recipeBook', '.recipe-target-heading h2'], ['resources', '.resource-target-heading h2'],
      ['guide', '.guide-detail h2'], ['world', '#world-heading'], ['dungeons', '#dungeon-heading'],
      ['time', '#timer-display'], ['journal', '.saved-card']
    ];
    for (const [name, ready] of sections) {
      await section(name).click();
      await heading(ready).waitFor();
      await bodyIsEnglish();
    }
    for (const [id, tabs] of [
      ['resources', ['Buildings', 'Creatures', 'My Recipes']],
      ['guide', ['Knowledge', 'Quests']],
      ['drops', ['Gathering and fishing', 'Creatures', 'Chests', 'Processing', 'Crafting', 'Bosses', 'Quests']],
      ['world', ['Prospecting', 'Biomes']]
    ]) {
      await section(id).click();
      for (const tab of tabs) {
        await view.getByRole('tab', { name: tab, exact: true }).click();
        await bodyIsEnglish();
      }
    }
    await page.getByRole('button', { name: 'Sources and help' }).click();
    assert.match(await page.locator('#modal').innerText(), /How the calculations work/);
    await page.getByRole('button', { name: /Got it/ }).click();

    await section('world').click();
    await page.getByRole('tab', { name: 'Biomes', exact: true }).click();
    const calmForest = page.locator('#world-results [data-id="1"]');
    await page.locator('#world-search').fill('Calm Forest');
    await calmForest.click();
    assert.equal(await heading('#world-heading').innerText(), 'Calm Forest');
    await language.selectOption('ru');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    assert.equal(await heading('#world-heading').innerText(), 'Спокойный лес (Calm Forest)');
    await page.locator('#world-search').fill('спокойный лес');
    await calmForest.waitFor();

    await section('recipeBook').click();
    const recipeSearch = page.locator('#recipe-search');
    await recipeSearch.fill('кирка ратия');
    const pickaxe = page.locator('#recipe-results .recipe-search-item').filter({ hasText: 'Кирка ратия (Rathium Pickaxe)' }).first();
    await pickaxe.click();
    assert.equal(await heading('.recipe-target-heading h2').innerText(), 'Кирка ратия (Rathium Pickaxe)');
    await language.selectOption('en');
    assert.equal(await heading('.recipe-target-heading h2').innerText(), 'Rathium Pickaxe');
    assert.equal(await recipeSearch.inputValue(), 'кирка ратия');
    await bodyIsEnglish();
    await page.screenshot({ path: 'output/localization-en-1420.png', fullPage: true });

    await section('resources').click();
    await view.getByRole('tab', { name: 'My Recipes', exact: true }).click();
    await language.selectOption('ru');
    assert.match(await view.locator('.data-table').first().innerText(), /Брёвна/);
    await view.getByRole('button', { name: /Материал/ }).click();
    assert.match(await page.locator('#ingredient-form [name="existing"]').innerText(), /Брёвна/);
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await language.selectOption('en');
    await bodyIsEnglish();

    await language.selectOption('ru');
    await page.reload();
    assert.equal(await language.inputValue(), 'ru');
    await section('journal').click();
    assert.match(await heading('.saved-card h2').innerText(), /Рог рангифера \(Rangifer Antler\)/);
    await section('drops').click();
    await view.getByRole('tab', { name: 'Пресеты', exact: true }).click();
    assert.equal(await page.locator('[data-key="drop.attempts"]').inputValue(), '321');
    await page.getByRole('tab', { name: 'Обработка' }).click();
    await page.locator('#drop-search').fill('прочный хитин');
    const chitin = page.locator('.drop-result[data-id="conversion:1745794600/item:496741270"]');
    await chitin.click();
    assert.match(await view.locator('h2').allTextContents().then(parts => parts.join(' ')), /Прочный хитин \(Hardened Lobster Chitin\)/);
    await language.selectOption('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await view.locator('output[data-drop-probability]').getAttribute('data-drop-probability'), '0.01');
    await bodyIsEnglish();
    await language.selectOption('ru');
    await page.setViewportSize({ width: 360, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await language.isVisible());
    await page.screenshot({ path: 'output/localization-ru-360.png', fullPage: true });
    assert.deepEqual(errors, []);

    for (const [browserLocale, expected] of [['ru-RU', 'ru'], ['fr-FR', 'en']]) {
      const freshContext = await browser.newContext({ locale: browserLocale, serviceWorkers: 'block' });
      const freshPage = await freshContext.newPage();
      await freshPage.goto(appURL());
      assert.equal(await freshPage.locator('#interface-language').inputValue(), expected);
      assert.equal(await freshPage.locator('html').getAttribute('lang'), expected);
      await freshContext.close();
    }
    console.log('PASS: two language options, system defaults and saved overrides, English tabs, bilingual cards and searches, saved attempts and mobile controls.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
