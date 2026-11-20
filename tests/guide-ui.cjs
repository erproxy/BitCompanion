const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, browserName, launchBrowser, catalogName } = require('./browser-runtime.cjs');

(async () => {
  await fs.mkdir('output', { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = hash => page.goto(appURL(hash));
    const target = page.locator('.recipe-target-heading h2');
    const guide = page.locator('#guide-detail');
    const heading = (container, name) => container.getByRole('heading', { name: catalogName(name) });
    const recipe = async (item, name) => {
      await open('#/recipes/item%3A' + item);
      await target.filter({ hasText: name }).waitFor();
    };
    const source = key => page.locator(`#recipe-acquisition [data-recipe-details="${key}"]`);

    await open('#/guide/skills/5/60');
    await heading(guide, 'Mining').waitFor();
    assert.match(await page.locator('#guide-results [aria-pressed="true"]').innerText(), /Горное дело \(Mining\)/);
    assert.equal(await guide.locator('[data-guide-level]').inputValue(), '60');
    await guide.getByRole('button', { name: catalogName("Rathium Pickaxe") }).first().waitFor();
    await page.screenshot({ path: 'output/guide-skills-1420.png' });

    await guide.getByRole('button', { name: catalogName("Craft Peerless Sand") }).click();
    await target.filter({ hasText: 'Peerless Sand' }).waitFor();
    const sand = source('crafting:971394239');
    assert.equal(await sand.evaluate(details => details.open), true);
    await sand.getByText('Требования и условия', { exact: true }).click();
    await sand.getByRole('button', { name: /\(Mining\) · уровень 60/ }).click();
    await heading(guide, 'Mining').waitFor();
    await guide.getByRole('button', { name: catalogName("MiningLevel60Stats") }).click();
    await heading(guide, 'MiningLevel60Stats').waitFor();
    assert.match(new URL(page.url()).hash, /^#\/guide\/knowledge\/\d+$/);

    await page.getByRole('tab', { name: 'Квесты', exact: true }).click();
    await page.locator('#guide-search').fill('The Long Haul');
    await page.locator('#guide-results').getByRole('button', { name: catalogName("The Long Haul") }).click();
    await heading(guide, 'The Long Haul').waitFor();
    assert.equal(await guide.locator('.guide-stages > li').count(), 4);
    assert.match(await guide.innerText(), /500 XP/);
    await guide.getByRole('button', { name: catalogName("Deed: Wagon") }).click();
    await target.filter({ hasText: 'Deed: Wagon' }).waitFor();
    const questRewards = page.locator('#recipe-acquisition').getByText(/Получить в квестах/);
    await questRewards.click();
    await page.locator('#recipe-acquisition').getByRole('button', { name: catalogName("The Long Haul") }).click();
    await heading(guide, 'The Long Haul').waitFor();

    await recipe(1859190999, 'Player House Deed 2');
    await page.locator('#recipe-acquisition').getByText(/Получить у путешественников/).click();
    const trade = page.locator('#recipe-acquisition .guide-trade').filter({ hasText: 'Brico' });
    assert.match(await trade.innerText(), /2\s?500/);
    await trade.getByRole('button', { name: /Beginner's Settlement Research/ }).click();
    await target.filter({ hasText: "Beginner's Settlement Research" }).waitFor();
    await page.getByText(/Отдать путешественникам/).click();
    await page.locator('.guide-trade [data-action="recipe-target"][data-id="item:1859190999"]').click();
    await target.filter({ hasText: 'Player House Deed 2' }).waitFor();
    await page.locator('#recipe-acquisition').getByText(/Получить у путешественников/).click();
    await trade.getByRole('button', { name: /\(Construction\) · уровень 10/ }).click();
    await heading(guide, 'Construction').waitFor();
    assert.equal(await guide.locator('[data-guide-level]').inputValue(), '1');
    assert.match(await guide.locator('.guide-current-level').textContent(), /уровень 10/);

    await open('#/guide/skills/9/33');
    await heading(guide, 'Hunting').waitFor();
    const skillTier = guide.getByLabel('Тир навыка');
    assert.equal(await skillTier.inputValue(), '30');
    assert.match(await skillTier.locator('option:checked').textContent(), /T3 · 30–40/);
    assert.match(await guide.locator('.guide-current-level').textContent(), /уровень 33/);
    const peltRows = guide.locator('.guide-unlock-row').filter({ hasText: 'Harvest Sturdy Raw Pelt' });
    assert.equal(await peltRows.count(), 2);
    assert.match(await peltRows.first().textContent(), /Рецепт с уровня 30.*Из (?:.*\(Female Cervus\)|Female Cervus)/s);
    assert.match(await peltRows.last().textContent(), /Рецепт с уровня 30.*Из (?:.*\(Cervus\)|Cervus)/s);
    assert.match(await guide.locator('.guide-unlock-row').filter({ hasText: 'Emarium Bow' }).first().textContent(), /Ношение с уровня 30 · T3/);
    await guide.locator('img[data-entity-image="item:11020"]').evaluate(img => img.decode());
    await page.locator('#guide-results [data-id="9"] img[data-entity-image="item:11020"]').waitFor();
    await skillTier.selectOption('20');
    assert.equal(new URL(page.url()).hash, '#/guide/skills/9/20');
    assert.equal(await peltRows.count(), 0);
    await skillTier.selectOption('30');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'output/guide-skill-tiers-1420.png', fullPage: true });
    await page.setViewportSize({ width: 360, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'output/guide-skill-tiers-360.png', fullPage: true });
    await page.setViewportSize({ width: 1420, height: 1050 });

    await recipe(1512222364, 'Sturdy Leather Cap');
    assert.match(await page.locator('.guide-characteristics').innerText(), /Условие ношения[\s\S]*уровень 30[\s\S]*\+2,4%/);
    await recipe(2140420099, 'Luminite Bow');
    assert.match(await page.locator('.guide-characteristics').innerText(), /Мощность\s+21[\s\S]*Урон\s+17–27/);
    await recipe(5170017, 'Succulent Mushroom Stuffed Bulbs');
    assert.match(await page.locator('.guide-characteristics').innerText(), /Сытость\s+\+40[\s\S]*30 мин[\s\S]*\+4,5%/);

    async function runDrop(method, preset, chance, unit) {
      const detail = source(method);
      await detail.locator('summary').first().click();
      await detail.getByRole('button', { name: /Рассчитать добычу/ }).click();
      await page.locator('body[data-tab="drops"]').waitFor();
      assert.equal(await page.locator('[data-key="drop.preset"]').inputValue(), preset);
      assert.equal(Number(await page.locator('[data-key="drop.chance"]').inputValue()), chance);
      assert.match(await page.locator('.drop-settings .tip').innerText(), unit);
    }
    await recipe(496741270, 'Hardened Lobster Chitin');
    await runDrop('conversion:271741003', 'lobster-chitin-t4', .5, /Fine Lobster\), T4/);
    await page.goBack();
    await target.filter({ hasText: 'Hardened Lobster Chitin' }).waitFor();
    await runDrop('conversion:1745794600', 'lobster-chitin-t6', 1, /Peerless Lobster\), T6/);
    await recipe(1118112344, 'Hexite Infused Lobster Chitin');
    await runDrop('conversion:546548972', 'hexite-chitin', 100 / 251, /Flawless Lobster\), T10/);

    await open('#/guide/skills/2/1');
    await heading(guide, 'Forestry').waitFor();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.ok((await page.evaluate(() => window.scrollY)) > 0, 'The guide is scrolled before following the recipe link');
    await guide.getByRole('button', { name: catalogName("Unpack Simple Wood Log") }).click();
    await target.filter({ hasText: 'Simple Wood Log' }).waitFor();
    assert.equal(await source('crafting:118959540').evaluate(details => details.open), true);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'The recipe opens at the top of the page');
    assert.equal(await page.locator('.page-title h1').evaluate(heading => document.activeElement === heading), true);

    for (const width of [1280, 760, 530, 390, 360]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 1100 });
      await open('#/guide/quests/1762918554');
      await heading(guide, 'The Long Haul').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Guide overflow at ${width}px`);
      await page.screenshot({ path: `output/guide-quest-${width}.png` });
    }
    await open('#/guide/quests/999999999');
    await heading(guide, 'Запись не найдена в снимке').waitFor();
    assert.deepEqual(errors, []);
    await context.close();

    if (browserName === 'chromium') {
      const offline = await browser.newContext({ locale: 'ru-RU', serviceWorkers: 'allow' });
      try {
        const offlinePage = await offline.newPage();
        await offlinePage.goto(appURL('#/drops'));
        await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
        await offline.setOffline(true);
        await offlinePage.goto(appURL('#/guide/quests/1762918554'));
        await offlinePage.reload();
        await offlinePage.locator('#guide-detail').getByRole('heading', { name: catalogName("The Long Haul") }).waitFor();
        await offlinePage.locator('#interface-language').selectOption('en');
        await offlinePage.locator('#guide-detail').getByRole('heading', { name: 'The Long Haul', exact: true }).waitFor();
        assert.equal(await offlinePage.locator('.guide-stages > li').count(), 4);
      } finally {
        await offline.close();
      }
    }
    console.log('PASS: guide navigation and recipe scroll, trades, stats, quests, drop shortcuts, responsive layouts and offline guide');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
