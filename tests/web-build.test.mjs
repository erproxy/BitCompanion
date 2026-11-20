import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { buildWeb } from '../scripts/build-web.mjs';
import { createWebServer, normalizeBasePath } from '../scripts/serve-web.mjs';
import { chooseEncoding } from '../scripts/web-headers.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const webpPath = 'assets/bitcraft/files/ab/' + 'ab'.repeat(32) + '.webp';

async function fixture() {
  const temporaryRoot = path.join(projectRoot, 'tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'web-build-test-'));
  const sourceRoot = path.join(root, 'web'), outputRoot = path.join(root, 'preview');
  const files = {
    'package.json': '{"version":"1.0.0","type":"module"}',
    'web/index.html': '<!doctype html>\n<html lang="ru"><head><title>BitCraft</title><link rel="icon" href="icon.svg"><link rel="stylesheet" href="styles.css"></head><body><div id="app"></div><script type="module" src="app.js"></script></body></html>',
    'web/app.js': "import {runtimeConfig} from './runtime-config.js'; document.querySelector('#app').textContent=runtimeConfig.release;\n",
    'web/runtime-config.js': "export const runtimeConfig={release:'source',assetBase:'./'};\n",
    'web/styles.css': 'body { background: #151f2a; color: #dce7e2; }\n'.repeat(50),
    'web/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
    'web/manifest.webmanifest': JSON.stringify({ name: 'BitCraft Companion', start_url: './', scope: './', icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] }),
    'web/sw.js': "self.addEventListener('install',event=>event.waitUntil(caches.open(RELEASE).then(cache=>cache.addAll(CORE))));\n",
    'web/entity-images.js': "export const DROP_ENTITY_KEYS=Object.freeze({'rangifer-antler':'item:123'});\n",
    'web/data/entity-images.js': '// Generated offline\nexport const entityImageIndex = ' + JSON.stringify({ images: { 'item:123': { file: webpPath.slice('assets/bitcraft/'.length) } }, files: { integrity: 'source only' }, dataCommit: 'source only' }) + ';\n',
    'web/data/recipe-catalog.json': JSON.stringify({ source: { commit: 'snapshot' }, entities: [], recipes: [] }),
    'web/data/catalog-ru.json': JSON.stringify({ commit: 'snapshot', strings: {} }),
    'data/public/recipe-catalog.json': JSON.stringify({ source: { commit: 'public-snapshot' }, entities: [], recipes: [] }),
    'data/public/catalog-ru.json': JSON.stringify({ commit: 'public-snapshot', strings: {} }),
    ['web/' + webpPath]: 'RIFF fixture WebP'
  };
  for (const [relative, content] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.writeFile(path.join(root, relative), content); }
  return {
    root, sourceRoot, outputRoot,
    build: () => buildWeb({ projectRoot: root, sourceRoot, outputRoot }),
    cleanup: async () => {
      assert.ok(root.startsWith(temporaryRoot + path.sep));
      await fs.rm(root, { recursive: true, force: true });
    }
  };
}

function request(url, { headers = {}, method = 'GET', rawPath } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({ hostname: target.hostname, port: target.port, path: rawPath || target.pathname + target.search, method, headers }, response => {
      const chunks = [];
      response.on('data', bytes => chunks.push(bytes));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.once('error', reject); req.end();
  });
}

test('static release is deterministic, complete and versioned', async () => {
  const f = await fixture();
  try {
    const first = await f.build();
    const html = await fs.readFile(path.join(f.outputRoot, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`src="\\./releases/${first.release}/app\\.js"`));
    assert.match(html, new RegExp(`href="\\./releases/${first.release}/manifest\\.webmanifest"`));
    assert.equal(html, await fs.readFile(path.join(f.outputRoot, first.releaseBase, 'shell.html'), 'utf8'));
    const config = await fs.readFile(path.join(f.outputRoot, first.releaseBase, 'runtime-config.js'), 'utf8');
    assert.ok(config.includes(`release:"${first.release}"`));
    assert.match(config, /new URL\('\.\/',import\.meta\.url\)/);
    const manifest = JSON.parse(await fs.readFile(path.join(f.outputRoot, first.releaseBase, 'manifest.webmanifest')));
    assert.equal(manifest.start_url, '../../'); assert.equal(manifest.scope, '../../');
    assert.equal(new URL(manifest.start_url, 'https://example.test/sub/' + first.releaseBase + 'manifest.webmanifest').pathname, '/sub/');
    assert.ok(first.core.includes(first.releaseBase + 'shell.html'));
    assert.ok(first.core.includes(first.releaseBase + 'data/recipe-catalog.json'));
    assert.ok(first.core.includes(first.releaseBase + 'data/catalog-ru.json'));
    assert.ok(first.core.includes(first.releaseBase + webpPath), 'preset icon is available in core offline shell');
    assert.deepEqual(first.imageFiles, [first.releaseBase + webpPath]);
    assert.ok(!first.core.includes('./'), 'mutable root HTML must not mix with an immutable SW release');
    for (const file of first.files) {
      const bytes = await fs.readFile(path.join(f.outputRoot, first.releaseBase, file.path));
      assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
    }
    const imageIndex = await fs.readFile(path.join(f.outputRoot, first.releaseBase, 'data/entity-images.js'), 'utf8');
    assert.ok(!imageIndex.includes('source only'));
    assert.ok((await fs.readFile(path.join(f.sourceRoot, 'data/entity-images.js'), 'utf8')).includes('source only'));
    const second = await f.build();
    assert.deepEqual(second, first);
    assert.equal(await fs.readFile(path.join(f.outputRoot, 'index.html'), 'utf8'), html);
    assert.match(await fs.readFile(path.join(f.sourceRoot, 'runtime-config.js'), 'utf8'), /release:'source'/);
  } finally { await f.cleanup(); }
});

test('a public build selects public data even when a full local snapshot exists', async () => {
  const f = await fixture();
  try {
    const outputRoot = path.join(f.root, 'published');
    const published = await buildWeb({ projectRoot: f.root, outputRoot, publicBuild: true });
    const assetDir = path.join(outputRoot, published.releaseBase);
    const read = file => fs.readFile(path.join(assetDir, file), 'utf8');
    assert.equal(published.publicData, true);
    assert.deepEqual(published.imageFiles, []);
    assert.ok(!published.files.some(file => file.path.startsWith('assets/bitcraft/')));
    assert.equal(JSON.parse(await read('data/recipe-catalog.json')).source.commit, 'public-snapshot');
    assert.equal(JSON.parse(await read('data/catalog-ru.json')).commit, 'public-snapshot');
    assert.match(await read('data/entity-images.js'), /"images":\{\}/);

    await f.build();
    await assert.rejects(
      buildWeb({ projectRoot: f.root, outputRoot: f.outputRoot, publicBuild: true }),
      /Public output contains a local release/
    );

    await fs.unlink(path.join(f.sourceRoot, 'data/recipe-catalog.json'));
    const fallback = await buildWeb({ projectRoot: f.root, outputRoot });
    assert.equal(fallback.release, published.release);
  } finally { await f.cleanup(); }
});

test('web build refuses unsafe output and unexpected source files', async () => {
  const f = await fixture();
  try {
    for (const outputRoot of [path.dirname(f.root), f.root, f.sourceRoot, path.join(f.sourceRoot, 'out')])
      await assert.rejects(buildWeb({ projectRoot: f.root, sourceRoot: f.sourceRoot, outputRoot }), /separate project subdirectory/);
    await fs.writeFile(path.join(f.sourceRoot, 'private.txt'), 'must not be published');
    await assert.rejects(f.build(), /Unexpected file in web source/);
  } finally { await f.cleanup(); }
});

test('static preview serves subpaths, encodings, headers, revalidation and a strict whitelist', async () => {
  const f = await fixture(); let running;
  try {
    const release = await f.build();
    running = await createWebServer({ root: f.outputRoot, port: 0, basePath: '/tools/companion/' });
    const root = await request(running.url);
    assert.equal(root.status, 200); assert.equal(root.headers['cache-control'], 'no-cache');
    assert.match(root.headers['content-type'], /^text\/html/); assert.equal(root.headers['x-content-type-options'], 'nosniff');
    assert.match(root.headers['content-security-policy'], /worker-src 'self'/);
    const online = await request(running.url + 'online.html');
    assert.equal(online.status, 200);
    assert.deepEqual(online.body, root.body);
    assert.equal(online.headers['cache-control'], 'no-cache');
    assert.match(online.headers['content-type'], /^text\/html/);
    const redirect = await request(running.url, { rawPath: '/tools/companion?x=1' });
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, '/tools/companion/?x=1');
    const cssUrl = running.url + release.releaseBase + 'styles.css';
    const raw = await request(cssUrl);
    assert.equal(raw.status, 200); assert.match(raw.headers['content-type'], /^text\/css/);
    assert.equal(raw.headers['cache-control'], 'public, max-age=31536000, immutable');
    for (const [encoding, decode] of [['gzip', gunzipSync], ['br', brotliDecompressSync]]) {
      const compressed = await request(cssUrl, { headers: { 'Accept-Encoding': encoding } });
      assert.equal(compressed.headers['content-encoding'], encoding); assert.deepEqual(decode(compressed.body), raw.body);
      assert.notEqual(compressed.headers.etag, raw.headers.etag); assert.equal(compressed.headers.vary, 'Accept-Encoding');
    }
    const noCompression = await request(cssUrl, { headers: { 'Accept-Encoding': 'br;q=0,gzip;q=0' } });
    assert.equal(noCompression.headers['content-encoding'], undefined); assert.deepEqual(noCompression.body, raw.body);
    const onlyGzip = await request(cssUrl, { headers: { 'Accept-Encoding': 'br;q=0,gzip;q=0.5' } });
    assert.equal(onlyGzip.headers['content-encoding'], 'gzip');
    assert.equal((await request(cssUrl, { headers: { 'Accept-Encoding': 'br;q=0,gzip;q=0,identity;q=0' } })).status, 406);
    const head = await request(cssUrl, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), raw.body.length);
    const cached = await request(cssUrl, { headers: { 'If-None-Match': 'W/' + raw.headers.etag } });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    assert.equal((await request(cssUrl, { headers: { 'If-Modified-Since': raw.headers['last-modified'] } })).status, 304);
    assert.equal((await request(cssUrl, { headers: { 'If-None-Match': '"different"', 'If-Modified-Since': raw.headers['last-modified'] } })).status, 200);
    for (const suffix of ['../package.json', '%2e%2e/package.json', '%252e%252e/package.json', 'bad%00.js', '%ZZ', 'app.js', '_headers', 'sw.js.br', 'releases/' + release.release + '/asset-manifest.json', release.releaseBase + 'styles.css.br', release.releaseBase + 'styles.css.map']) {
      assert.equal((await request(running.url, { rawPath: '/tools/companion/' + suffix })).status, 404, suffix);
    }
    assert.equal((await request(running.url, { rawPath: '/index.html' })).status, 404);
    assert.equal((await request(running.url, { method: 'POST' })).status, 405);
    const image = await request(running.url + release.releaseBase + webpPath, { headers: { 'Accept-Encoding': 'br,gzip' } });
    assert.equal(image.headers['content-type'], 'image/webp'); assert.equal(image.headers['content-encoding'], undefined);
    await assert.rejects(fs.stat(path.join(f.outputRoot, release.releaseBase + webpPath + '.br')), { code: 'ENOENT' });
    await assert.rejects(createWebServer({ root: f.root, port: 0 }), /ENOENT/);
  } finally { if (running) await running.close(); await f.cleanup(); }
});

test('new web releases retain old immutable URLs for open tabs', async () => {
  const f = await fixture(); let running;
  try {
    const first = await f.build();
    const oldScript = await fs.readFile(path.join(f.outputRoot, first.releaseBase, 'app.js'));
    await fs.appendFile(path.join(f.sourceRoot, 'app.js'), '// changed release\n');
    const second = await f.build(); assert.notEqual(first.release, second.release);
    running = await createWebServer({ root: f.outputRoot, port: 0 });
    assert.deepEqual((await request(running.url + first.releaseBase + 'app.js')).body, oldScript);
    assert.match((await request(running.url)).body.toString(), new RegExp(second.release));
  } finally { if (running) await running.close(); await f.cleanup(); }
});

test('encoding negotiation honors q=0, wildcard and explicit identity preferences', () => {
  assert.equal(chooseEncoding(undefined), 'identity');
  assert.equal(chooseEncoding('br;q=0,gzip;q=0.5'), 'gzip');
  assert.equal(chooseEncoding('br;q=0,*;q=1'), 'gzip');
  assert.equal(chooseEncoding('gzip;q=1,br;q=0.5'), 'gzip');
  assert.equal(chooseEncoding('br;q=invalid,gzip;q=0'), 'identity');
  assert.equal(chooseEncoding('*;q=0'), null);
  assert.equal(chooseEncoding('br;q=1,identity;q=0', new Set()), null);
  assert.equal(chooseEncoding('br;q=0.5,identity;q=1'), 'identity');
  assert.equal(normalizeBasePath('/companion'), '/companion/');
  assert.throws(() => normalizeBasePath('/../private'), /Base path/);
});

test('optional remote illustrations are versioned and restricted to the configured HTTPS origin', async () => {
  const f = await fixture(); let running;
  const origin = 'https://images.example.test';
  const iconPath = path.join(f.root, 'data/public/remote-icons.json');
  const configuration = { baseUrl: origin + '/bitcraft/', images: { 'item:123': 'tools/axe.webp', 'family:item:567': 'materials/ore.webp' } };
  const outputRoot = path.join(f.root, 'published');
  const build = () => buildWeb({ projectRoot: f.root, outputRoot, publicBuild: true });
  try {
    const first = await build();
    assert.equal(first.imageOrigin, undefined);
    await fs.writeFile(iconPath, JSON.stringify(configuration));
    const next = await build();
    assert.notEqual(next.release, first.release);
    assert.equal(next.imageOrigin, origin);
    assert.deepEqual(next.imageFiles, []);
    assert.ok(next.core.every(resource => !resource.includes(origin)));
    const indexText = await fs.readFile(path.join(outputRoot, next.releaseBase, 'data/entity-images.js'), 'utf8');
    assert.ok(indexText.includes(JSON.stringify(configuration)), 'the public image mapping is included in the runtime index');
    assert.equal((await f.build()).imageOrigin, undefined, 'full builds continue to use their local image package');

    running = await createWebServer({ root: outputRoot, port: 0, basePath: '/BitCompanion/' });
    const document = await request(running.url);
    assert.ok(document.body.toString().includes("img-src 'self' data: " + origin));
    assert.ok(document.headers['content-security-policy'].includes("img-src 'self' data: " + origin + ';'));
    const previous = await request(running.url + first.releaseBase + 'shell.html');
    assert.ok(!previous.headers['content-security-policy'].includes(origin));
    assert.equal((await request(running.url + 'data/public/remote-icons.json')).status, 404);

    const invalidSources = [
      { ...configuration, baseUrl: 'http://images.example.test/bitcraft/' },
      { ...configuration, baseUrl: 'https://*.example.test/bitcraft/' },
      { ...configuration, baseUrl: 'https://reader:secret@images.example.test/' },
      { ...configuration, images: { 'item:123': 'https://images.example.test/bitcraft/axe.webp' } },
      { ...configuration, images: { 'item:123': '//unrelated.example/axe.webp' } },
      { ...configuration, images: { 'item:123': '../axe.webp' } },
      { ...configuration, images: { 'item:123': 'axe.webp#invalid' } },
      { ...configuration, images: { '__ignored__': 'axe.webp' } }
    ];
    for (const invalid of invalidSources) {
      await fs.writeFile(iconPath, JSON.stringify(invalid));
      await assert.rejects(build(), /remote-icons\.json/);
    }
    assert.equal(JSON.parse(await fs.readFile(path.join(outputRoot, 'release.json'))).release, next.release);
  } finally { if (running) await running.close(); await f.cleanup(); }
});
