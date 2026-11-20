const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appURL, launchBrowser } = require('./browser-runtime.cjs');

const STORE = 'bitcraft-companion-v1';
const ingredient = (id, name, amount) => ({ id, name, amount });
const recipe = (id, name, ingredients) => ({ id, name, output: 1, seconds: 1, ingredients });
const resources = {
  targetId: 'tool', editId: 'tool', quantity: 1, inventory: {},
  recipes: [
    recipe('tool', 'Инструмент', [ingredient('boards', 'Доски', 10), ingredient('ingots', 'Слитки', 10)]),
    recipe('boards', 'Доски', [ingredient('logs', 'Брёвна', 1)]),
    recipe('ingots', 'Слитки', [ingredient('ore', 'Руда', 1)])
  ]
};
const olderResources = { ...resources, quantity: 2 };
const olderPlan = { id: 'older-fixture', type: 'resources', title: 'Старый план', data: olderResources, date: Date.now() };

(async () => {
  await fs.mkdir('output', { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      locale: 'ru-RU', viewport: { width: 1420, height: 1050 }, serviceWorkers: 'block', acceptDownloads: true
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    }, [STORE, { version: 1, resources, saved: [olderPlan] }]);
    await page.goto(appURL('#/resources/custom'));
    await page.locator('[data-action="save"][data-type="resources"]').click();
    await page.locator('[data-action="tab"][data-tab="journal"]').click();
    const cards = page.locator('.saved-card');
    assert.equal(await cards.count(), 2);
    const open = cards.first().getByRole('button', { name: 'Открыть', exact: true });
    assert.ok(await open.evaluate(button => button.offsetWidth >= 90 && button.scrollWidth <= button.clientWidth));
    await page.screenshot({ path: 'output/plans-cards-1420.png' });
    await open.click();

    const checklist = page.locator('.plan-checklist');
    await checklist.waitFor();
    assert.equal(new URL(page.url()).hash, '#/plans/checklist');
    assert.equal(await page.locator('#journal-tab-checklist').getAttribute('aria-selected'), 'true');
    const rows = checklist.locator('[data-plan-row]');
    const row = key => rows.and(checklist.locator(`[data-plan-row="${key}"]`));
    const progress = key => row(key).locator('[data-plan-progress]');
    const balance = async key => Number(await row(key).locator('[data-plan-left]').textContent());
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.planRow)), ['tool', 'boards', 'logs', 'ingots', 'ore']);
    assert.equal(await checklist.locator('.plan-item .entity-image').count(), 5);
    assert.equal(await balance('logs'), 10);
    await progress('logs').fill('8');
    await progress('boards').fill('8');
    assert.equal(await balance('boards'), 2);
    assert.equal(await balance('logs'), 2);
    assert.equal(await balance('ore'), 10);
    assert.ok(await progress('boards').evaluate(field => field === document.activeElement));
    await page.screenshot({ path: 'output/plans-checklist-1420.png' });
    await progress('boards').fill('10');
    assert.equal(await row('boards').locator('.plan-complete').isVisible(), true);
    assert.equal(await balance('logs'), 0);
    await progress('boards').fill('8');
    assert.equal(await row('boards').locator('.plan-complete').isVisible(), false);
    assert.equal(await balance('logs'), 2);

    const boardsToggle = row('boards').getByRole('button', { name: 'Доски' });
    await boardsToggle.click();
    assert.equal(await boardsToggle.getAttribute('aria-expanded'), 'false');
    assert.ok(await row('logs').isHidden());
    assert.ok(await row('ingots').isVisible());
    await checklist.getByRole('tab', { name: 'Цепочка' }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await checklist.getByRole('tab', { name: 'По группам' }).getAttribute('aria-selected'), 'true');
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.planRow)), ['tool', 'logs', 'boards', 'ore', 'ingots']);
    await progress('boards').fill('9');
    assert.equal(await balance('logs'), 1);
    await checklist.getByRole('tab', { name: 'Цепочка' }).click();
    assert.ok(await row('logs').isHidden());
    await boardsToggle.press('Space');
    assert.ok(await row('logs').isVisible());
    assert.equal(await progress('boards').inputValue(), '9');
    await progress('boards').fill('8');

    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.saved[0]?.progress?.boards === 8, STORE);
    await page.reload();
    assert.equal(await progress('boards').inputValue(), '8');
    assert.equal(await progress('logs').inputValue(), '8');
    assert.equal(await balance('logs'), 2);
    const downloading = page.waitForEvent('download');
    await page.locator('.top-actions [data-action="export"]').click();
    const exported = JSON.parse(await fs.readFile(await (await downloading).path(), 'utf8'));
    assert.deepEqual(exported.saved[0].progress, { logs: 8, boards: 8 });
    assert.deepEqual(exported.saved[0].data.inventory, {});

    await page.locator('#journal-tab-checklist').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#journal-tab-list').getAttribute('aria-selected'), 'true');
    await cards.nth(1).getByRole('button', { name: 'Открыть', exact: true }).click();
    assert.equal(await progress('boards').inputValue(), '0');
    assert.equal(await balance('boards'), 20);
    await page.goBack();
    await cards.first().waitFor();
    await page.goBack();
    assert.equal(await progress('boards').inputValue(), '8');
    assert.equal(await balance('logs'), 2);

    for (const width of [1280, 760, 530, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow at ' + width);
      assert.ok(await progress('boards').evaluate(field => {
        const rect = field.getBoundingClientRect();
        return rect.width > 35 && rect.left >= 0 && rect.right <= innerWidth;
      }), 'field outside viewport at ' + width);
    }
    await page.screenshot({ path: 'output/plans-checklist-360.png', fullPage: true });
    await checklist.getByRole('button', { name: 'К расчёту' }).click();
    await page.locator('.recipe-editor').waitFor();
    assert.equal(new URL(page.url()).hash, '#/resources/custom');

    await page.setViewportSize({ width: 1420, height: 1050 });
    await page.goto(appURL('#/recipes/item%3A1486054968'));
    await page.getByLabel('Редкость в плане').selectOption('exact');
    const amount = page.locator('[data-key="recipeBook.quantity"]');
    await amount.fill('10');
    await amount.press('Tab');
    await page.locator('[data-action="save"][data-type="recipeBook"]').click();
    await page.locator('[data-action="tab"][data-tab="journal"]').click();
    await page.locator('.saved-card').filter({ hasText: 'Emarium Axe' }).getByRole('button', { name: 'Открыть', exact: true }).click();
    await checklist.locator('[data-plan-craft-reference]').waitFor();
    assert.match(await checklist.locator('.plan-target-row').innerText(), /Emarium Axe/);
    assert.equal(await checklist.locator('.plan-target-row').getAttribute('data-plan-row'), 'item:1486054968');
    assert.ok(await checklist.locator('[data-plan-row]').count() > 1);
    await page.screenshot({ path: 'output/plans-emarium-exact-1420.png' });

    await page.goto(appURL('#/recipes/family%3Aitem%3A489724302'));
    await amount.fill('100');
    await amount.press('Tab');
    await page.locator('[data-action="save"][data-type="recipeBook"]').click();
    await page.locator('[data-action="tab"][data-tab="journal"]').click();
    await cards.filter({ hasText: 'Elenvar Axe' }).getByRole('button', { name: 'Открыть', exact: true }).click();
    const emarium = row('family:item:1486054968');
    await emarium.locator('[data-plan-progress]').fill('100');
    const logs = row('item:1010001');
    const neededLogs = logs.and(checklist.locator('[data-complete="false"]'));
    assert.ok(await logs.count() > 1);
    assert.equal(await logs.first().locator('[data-plan-left]').textContent(), '0');
    assert.equal(await neededLogs.locator('[data-plan-left]').textContent(), '34');
    assert.equal(await row('item:1201067083').getAttribute('data-complete'), 'true');
    await emarium.locator('.plan-branch-toggle').click();
    assert.ok(await row('item:1201067083').isHidden());
    assert.ok(await logs.first().isHidden());
    assert.ok(await neededLogs.isVisible());
    await page.screenshot({ path: 'output/plans-elenvar-chain-1420.png' });

    await checklist.getByRole('tab', { name: 'По группам' }).click();
    assert.equal(await logs.count(), 1);
    assert.equal(await balance('item:1010001'), 34);
    assert.equal(await balance('cargo:1000'), 6);
    const wood = logs.locator('..');
    assert.equal(await wood.locator('.plan-group-heading').count(), 1);
    assert.deepEqual(await wood.locator('[data-plan-row]').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.dataset.planRow)),
      ['cargo:1000', 'item:1010001', 'item:1320886430', 'item:1020003']);
    await wood.locator('.plan-group-heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/plans-elenvar-groups-1420.png' });
    await page.setViewportSize({ width: 360, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'output/plans-elenvar-groups-360.png' });
    await progress('item:1010001').fill('1146');
    assert.equal(await balance('item:1010001'), 0);
    await checklist.getByRole('tab', { name: 'Цепочка' }).click();
    assert.equal(await logs.locator('[data-plan-progress]').evaluateAll(fields => fields.every(field => field.value === '1146')), true);
    assert.ok(await row('item:1201067083').isHidden());

    assert.deepEqual(errors, []);
    console.log('PASS: saved plan branches, profession groups, responsive layout, progress, navigation, local storage and export.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
