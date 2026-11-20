const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, assetURL, launchBrowser } = require('./browser-runtime.cjs');

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
    const chooseLanguage = async code => {
      await language.selectOption(code);
      await page.waitForFunction(code => document.querySelector('#interface-language option[selected]')?.value === code, code);
    };
    const bodyIsEnglish = async () => {
      await view.locator('.error').waitFor({ state: 'hidden' });
      const text = await view.innerText();
      assert.ok(!/\p{Script=Cyrillic}/u.test(text), text.match(/.{0,40}\p{Script=Cyrillic}.{0,60}/u)?.[0]);
    };

    await page.goto(appURL());
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await language.inputValue(), 'en');
    const { gameLocalization } = await (await page.request.get(appURL('release.json'))).json();
    const official = gameLocalization?.languages ?? [];
    const options = [
      ['ru', 'Русский'], ['en', 'English'], ['de', 'Deutsch'], ['es-419', 'Español (Latinoamérica)'],
      ['fr', 'Français'], ['ja', '日本語'], ['pl', 'Polski'], ['pt-BR', 'Português (Brasil)'],
      ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文']
    ].filter(([code]) => code === 'ru' || code === 'en' || official.includes(code));
    assert.deepEqual(await language.locator('option').evaluateAll(options => options.map(option => [option.value, option.text])), options);
    const packs = new Map();
    const gameLabel = async (code, name, fallback = name) => {
      if (official.includes(code) && !packs.has(code)) {
        const releasePath = 'data/game-localization/' + code + '.json';
        const response = await page.request.get(await assetURL(page, releasePath));
        assert.ok(response.ok());
        const pack = await response.json();
        assert.equal(pack.language, code);
        assert.equal(pack.commit, gameLocalization.commit);
        packs.set(code, pack.strings);
      }
      const translated = packs.get(code)?.[name] ?? fallback;
      return translated !== name ? translated + ' (' + name + ')' : name;
    };
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
    await chooseLanguage('ru');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    assert.equal(await heading('#world-heading').innerText(), await gameLabel('ru', 'Calm Forest', 'Спокойный лес'));
    await page.locator('#world-search').fill('спокойный лес');
    await calmForest.waitFor();
    if (official.includes('fr')) {
      await chooseLanguage('fr');
      assert.equal(await heading('#world-heading').innerText(), await gameLabel('fr', 'Calm Forest'));
      await page.locator('#world-search').fill(packs.get('fr')['Calm Forest']);
      await calmForest.waitFor();
      await chooseLanguage('ru');
    }

    await section('recipeBook').click();
    const recipeSearch = page.locator('#recipe-search');
    await recipeSearch.fill('кирка ратия');
    const russianPickaxe = await gameLabel('ru', 'Rathium Pickaxe', 'Кирка ратия');
    const pickaxe = page.locator('#recipe-results .recipe-search-item').filter({ hasText: russianPickaxe }).first();
    await pickaxe.click();
    assert.equal(await heading('.recipe-target-heading h2').innerText(), russianPickaxe);
    for (const code of official.filter(code => code !== 'ru')) {
      await chooseLanguage(code);
      const expected = await gameLabel(code, 'Rathium Pickaxe');
      assert.notEqual(expected, 'Rathium Pickaxe', code);
      assert.equal(await heading('.recipe-target-heading h2').innerText(), expected);
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      if (code === 'ja') {
        await recipeSearch.fill(packs.get(code)['Rathium Pickaxe']);
        await page.locator('#recipe-results .recipe-search-item').filter({ hasText: expected }).first().waitFor();
        await recipeSearch.fill('кирка ратия');
      }
    }
    await chooseLanguage('en');
    assert.equal(await heading('.recipe-target-heading h2').innerText(), 'Rathium Pickaxe');
    assert.equal(await recipeSearch.inputValue(), 'кирка ратия');
    await bodyIsEnglish();
    await page.screenshot({ path: 'output/localization-en-1420.png', fullPage: true });

    await section('resources').click();
    await view.getByRole('tab', { name: 'My Recipes', exact: true }).click();
    await chooseLanguage('ru');
    assert.match(await view.locator('.data-table').first().innerText(), /Брёвна/);
    await view.getByRole('button', { name: /Материал/ }).click();
    assert.match(await page.locator('#ingredient-form [name="existing"]').innerText(), /Брёвна/);
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await chooseLanguage('en');
    await bodyIsEnglish();

    await chooseLanguage('ru');
    await page.reload();
    assert.equal(await language.inputValue(), 'ru');
    await section('journal').click();
    assert.ok((await heading('.saved-card h2').innerText()).includes(await gameLabel('ru', 'Rangifer Antler', 'Рог рангифера')));
    await section('drops').click();
    await view.getByRole('tab', { name: 'Пресеты', exact: true }).click();
    assert.equal(await page.locator('[data-key="drop.attempts"]').inputValue(), '321');
    await page.getByRole('tab', { name: 'Обработка' }).click();
    await page.locator('#drop-search').fill('прочный хитин');
    const chitin = page.locator('.drop-result[data-id="conversion:1745794600/item:496741270"]');
    await chitin.click();
    const chitinName = 'Hardened Lobster Chitin';
    assert.ok((await view.locator('h2').allTextContents()).includes(await gameLabel('ru', chitinName, 'Прочный хитин')));
    if (official.includes('fr')) {
      await chooseLanguage('fr');
      await page.locator('#drop-search').fill(packs.get('fr')[chitinName]);
      await chitin.waitFor();
      assert.ok((await view.locator('h2').allTextContents()).includes(await gameLabel('fr', chitinName)));
    }
    await chooseLanguage('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await view.locator('output[data-drop-probability]').getAttribute('data-drop-probability'), '0.01');
    await bodyIsEnglish();
    await chooseLanguage('ru');
    await page.locator('#drop-search').fill('прочный хитин');
    await page.setViewportSize({ width: 360, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await language.isVisible());
    await page.screenshot({ path: 'output/localization-ru-360.png', fullPage: true });
    assert.deepEqual(errors, []);

    for (const [browserLocale, expected] of [['ru-RU', 'ru'], ['fr-FR', official.includes('fr') ? 'fr' : 'en']]) {
      const freshContext = await browser.newContext({ locale: browserLocale, serviceWorkers: 'block' });
      const freshPage = await freshContext.newPage();
      await freshPage.goto(appURL());
      assert.equal(await freshPage.locator('#interface-language').inputValue(), expected);
      assert.equal(await freshPage.locator('html').getAttribute('lang'), expected === 'ru' ? 'ru' : 'en');
      await freshContext.close();
    }
    if (official.includes('zh-Hant')) {
      const offline = await browser.newContext({ locale: 'en-US', viewport: { width: 360, height: 900 } });
      try {
        const offlinePage = await offline.newPage();
        await offlinePage.goto(appURL());
        await offlinePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 60000 });
        await offline.setOffline(true);
        await offlinePage.reload();
        await offlinePage.locator('#interface-language').selectOption('zh-Hant');
        await offlinePage.getByRole('heading', { name: await gameLabel('zh-Hant', 'Rangifer Antler'), exact: true }).waitFor();
        assert.ok(await offlinePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      } finally { await offline.close(); }
    }
    console.log('PASS: language options, system defaults and saved overrides, localized cards and searches, saved attempts and mobile controls.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
