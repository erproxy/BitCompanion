const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchBrowser } = require('./browser-runtime.cjs');

const projectRoot = path.resolve(__dirname, '..');
const origin = 'https://images.example.test';
const antler = '/bitcraft/antler.svg';
const away = '/bitcraft/axe.svg';
const unavailable = '/bitcraft/unavailable.webp';
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="9" fill="#78b7a3"/></svg>';

async function withPublicPreview(test) {
  const tempRoot = path.join(projectRoot, 'tmp');
  await fs.mkdir(tempRoot, {recursive:true});
  const root = await fs.mkdtemp(path.join(tempRoot, 'remote-images-ui-'));
  let preview;
  try {
    const data = path.join(root, 'data/public');
    await fs.mkdir(data, {recursive:true});
    await Promise.all([
      fs.copyFile(path.join(projectRoot, 'package.json'), path.join(root, 'package.json')),
      ...['recipe-catalog.json','catalog-ru.json'].map(file =>
        fs.copyFile(path.join(projectRoot, 'data/public', file), path.join(data, file))),
      fs.writeFile(path.join(data, 'remote-icons.json'), JSON.stringify({
        baseUrl: origin + '/bitcraft/',
        images: {
          'item:400827528': 'antler.svg',
          'item:90000001': 'axe.svg',
          'item:90000002': 'unavailable.webp'
        }
      }))
    ]);
    const { buildWeb } = await import('../scripts/build-web.mjs');
    const { createWebServer } = await import('../scripts/serve-web.mjs');
    const release = await buildWeb({projectRoot:root, sourceRoot:path.join(projectRoot,'web'), publicBuild:true});
    preview = await createWebServer({root:release.outputRoot, port:0, basePath:'/BitCompanion/'});
    await test(preview.url);
  } finally {
    if (preview) await preview.close();
    const realRoot = await fs.realpath(root);
    const realTemp = await fs.realpath(tempRoot);
    assert.equal(path.dirname(realRoot), realTemp);
    assert.equal(path.basename(realRoot), path.basename(root));
    await fs.rm(root, {recursive:true, force:true});
  }
}

withPublicPreview(async url => {
  const browser = await launchBrowser();
  let releaseAntler;
  const delay = new Promise(resolve => { releaseAntler = resolve; });
  const seen = [];
  let offline = false;
  try {
    const context = await browser.newContext({locale:'ru-RU', viewport:{width:1280,height:900}});
    await context.route(origin + '/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      seen.push({pathname, referer:(await request.allHeaders()).referer});
      if (offline) return route.abort('internetdisconnected');
      if (pathname === antler) await delay;
      if (pathname === unavailable) return route.fulfill({status:404});
      await route.fulfill({contentType:'image/svg+xml', body:image});
    });
    const page = await context.newPage();
    await page.goto(url);
    const emblem = page.locator('.hero-info .entity-image');
    const fallback = emblem.locator('.entity-image-fallback');
    await emblem.locator('img[src]').first().waitFor();
    assert.equal(await fallback.isVisible(), true, 'fallback remains visible during a slow image request');
    const before = await emblem.boundingBox();
    releaseAntler();
    await emblem.locator('img[data-image-ready]').waitFor();
    assert.equal(await fallback.isVisible(), false);
    const after = await emblem.boundingBox();
    assert.deepEqual([after.width,after.height], [before.width,before.height]);

    // Keep an ordinary entity image well below the viewport to distinguish
    // rendering it into the DOM from initiating its network request.
    const addOffscreen = async key => page.evaluate(async key => {
      const module = document.querySelector('script[type="module"][src]');
      const { entityImage } = await import(new URL('entity-images.js', module.src));
      const row = document.createElement('div');
      row.id = 'offscreen-image';
      row.style.marginTop = '4000px';
      row.innerHTML = entityImage(key);
      document.body.append(row);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, key);
    await addOffscreen('item:90000001');
    let row = page.locator('#offscreen-image');
    assert.equal(await row.locator('img').getAttribute('src'), null);
    assert.equal(seen.some(request => request.pathname === away), false);
    await row.scrollIntoViewIfNeeded();
    await row.locator('img[data-image-ready]').waitFor();

    await row.evaluate(node => node.remove());
    await addOffscreen('item:90000002');
    row = page.locator('#offscreen-image');
    await row.scrollIntoViewIfNeeded();
    await row.locator('img').waitFor({state:'detached'});
    assert.equal(await row.locator('.entity-image-fallback').isVisible(), true);
    assert.equal(seen.filter(request => request.pathname === unavailable).length, 1);
    await row.evaluate(node => node.remove());
    await addOffscreen('item:90000002');
    assert.equal(await page.locator('#offscreen-image img').count(), 0, 'rerender does not retry a failed URL');
    assert.equal(seen.every(request => !request.referer), true);

    await page.waitForFunction(async () => {
      const module = document.querySelector('script[type="module"][src]');
      return (await import(new URL('web-platform.js', module.src))).getWebPlatformState().ready;
    });
    offline = true;
    await context.setOffline(true);
    await page.reload();
    await fallback.waitFor();
    assert.equal(await emblem.locator('img[data-image-ready]').count(), 0);
    assert.equal(await page.evaluate(async url => !!await caches.match(url), origin + antler), false);
    console.log('PASS: visible-only public images, delayed replacement without layout shifts, no referrer, 404 fallback, and offline SVG.');
  } finally { releaseAntler(); await browser.close(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
