import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { allowedBrowserPath, compressible, isHttpsImageOrigin, staticHostHeaders } from './web-headers.mjs';
import { catalogLocales, gameLanguageFile } from '../web/catalog-locales.js';

const here = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(here), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogFiles = ['data/recipe-catalog.json', 'data/catalog-ru.json'];
const noGameImages = Buffer.from('export const entityImageIndex = {"images":{}};\n');
const gameLocalizationDirectory = 'data/game-localization/';

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Web source cannot contain symbolic links: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function writeFile(filename, bytes, immutable = false, safeRoot) {
  if (safeRoot) await rejectOutputLinks(safeRoot, path.dirname(filename));
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    if ((await fs.lstat(filename)).isSymbolicLink()) throw new Error(`Web output cannot overwrite a symbolic link: ${filename}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (immutable) {
    try {
      const previous = await fs.readFile(filename);
      if (!previous.equals(Buffer.from(bytes))) throw new Error(`Refusing to change immutable web asset: ${filename}`);
      return;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (immutable) return fs.writeFile(filename, bytes, { flag: 'wx' });
  const temporary = filename + '.tmp-' + process.pid;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx' });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

function rootHtml(source, prefix, imageOrigin) {
  let html = source.replace(/\b(href|src)=(['"])([^'"<>]+)\2/g, (all, attribute, quote, value) => {
    if (/^(?:[a-z]+:|\/|#)/i.test(value)) return all;
    const relative = value.replace(/^\.\//, '');
    if (relative.split('/').includes('..') || !allowedBrowserPath(relative)) throw new Error(`Unexpected HTML asset reference: ${value}`);
    return `${attribute}=${quote}./${prefix}${relative}${quote}`;
  });
  if (!/<link\b[^>]*\brel=['"]manifest['"]/i.test(html))
    html = html.replace('</head>', `  <link rel="manifest" href="./${prefix}manifest.webmanifest">\n</head>`);
  if (imageOrigin)
    html = html.replace('</head>', `  <meta http-equiv="Content-Security-Policy" content="img-src 'self' data: ${imageOrigin}">\n</head>`);
  return html;
}

function presetImageFiles(sources) {
  const module = sources.get('entity-images.js')?.toString() || '';
  const declaration = module.match(/export const DROP_ENTITY_KEYS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/)?.[1];
  const indexSource = sources.get('data/entity-images.js')?.toString() || '';
  if (!declaration || !indexSource) return [];
  const json = indexSource.match(/export const entityImageIndex\s*=\s*([\s\S]*?);?\s*$/)?.[1]?.replace(/;$/, '');
  if (!json) throw new Error('Cannot read generated image index for offline preset icons.');
  const index = JSON.parse(json);
  const keys = [...declaration.matchAll(/['"]item:\d+['"]/g)].map(match => match[0].slice(1, -1));
  return [...new Set(keys.map(key => index.images?.[key]?.file).filter(Boolean).map(file => 'assets/bitcraft/' + file))].sort();
}

function parseUrl(value, base) {
  try { return new URL(value, base); } catch { return null; }
}

async function readRemoteIcons(projectRoot) {
  const filename = path.join(projectRoot, 'data/public/remote-icons.json');
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error('Invalid JSON in data/public/remote-icons.json.');
    throw error;
  }
  const base = typeof manifest?.baseUrl === 'string' && parseUrl(manifest.baseUrl);
  if (!base || !isHttpsImageOrigin(base.origin) || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/'))
    throw new Error('remote-icons.json requires an HTTPS baseUrl ending in / without credentials, a query or a fragment.');
  if (!manifest.images || typeof manifest.images !== 'object' || Array.isArray(manifest.images))
    throw new Error('remote-icons.json requires an images object keyed by catalog entity.');

  const images = Object.create(null);
  for (const [key, file] of Object.entries(manifest.images)) {
    if (!/^(?:[a-z]+:){1,2}-?\d+$/.test(key)) throw new Error('Invalid entity key in remote-icons.json.');
    const image = typeof file === 'string' && file && !/^[a-z][a-z0-9+.-]*:/i.test(file) && !/^[\\/]|[\u0000-\u0020\\]/.test(file) && parseUrl(file, base);
    if (!image || image.origin !== base.origin || image.username || image.password || image.hash ||
        !image.pathname.startsWith(base.pathname) || image.pathname === base.pathname)
      throw new Error(`Invalid relative image path for ${key} in remote-icons.json.`);
    images[key] = image.href.slice(base.href.length);
  }
  return Object.keys(images).length ? { baseUrl: base.href, images } : null;
}

function compactImageIndex(bytes, remote) {
  const json = bytes.toString().match(/export const entityImageIndex\s*=\s*([\s\S]*?);?\s*$/)?.[1]?.replace(/;$/, '');
  if (!json) throw new Error('Cannot read generated entity image index.');
  const index = JSON.parse(json);
  if (!index.images || typeof index.images !== 'object') throw new Error('Image bindings are missing from generated index.');
  return Buffer.from('// Runtime projection; integrity metadata remains in the source package.\nexport const entityImageIndex=' + JSON.stringify({ images: index.images, ...(remote ? { remote } : {}) }) + ';\n');
}

async function rejectOutputLinks(projectRoot, outputRoot) {
  let current = projectRoot;
  for (const segment of path.relative(projectRoot, outputRoot).split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Web output path is not an ordinary directory: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function verifyPublicOutput(projectRoot, outputRoot, publicBuild) {
  const releases = path.join(outputRoot, 'releases');
  await rejectOutputLinks(projectRoot, releases);
  let versions;
  try { versions = await fs.readdir(releases); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const version of versions) {
    const directory = path.join(releases, version);
    await rejectOutputLinks(projectRoot, directory);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'asset-manifest.json'), 'utf8'));
    if (manifest.publicData !== true || (publicBuild && manifest.files.some(file => file.path.startsWith(gameLocalizationDirectory))))
      throw new Error('Public output contains a local release. Choose a separate output directory.');
  }
}

async function readGameLocalization(projectRoot, catalogCommit) {
  let imported;
  try { imported = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/bitcraft/localization/catalog.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (imported?.formatVersion !== 1 || !/^\d+$/.test(imported.steamBuild) || !imported.languages
    || !Object.keys(imported.languages).length)
    throw new Error('Invalid local BitCraft translation import.');
  if (imported.commit !== catalogCommit) {
    console.warn('The local BitCraft translations are from another catalog snapshot. Run data:localizations to refresh them.');
    return null;
  }
  for (const [language, pack] of Object.entries(imported.languages)) {
    if (!Object.hasOwn(catalogLocales, language) || !catalogLocales[language].asset
      || !pack?.strings || typeof pack.strings !== 'object' || Array.isArray(pack.strings)
      || !Object.values(pack.strings).every(value => typeof value === 'string' && value.trim()))
      throw new Error('Invalid local BitCraft translation: ' + language);
  }
  return imported;
}

export async function buildWeb({ projectRoot = defaultProjectRoot, sourceRoot = path.join(projectRoot, 'web'), publicBuild = false,
  outputRoot = path.join(projectRoot, publicBuild ? 'dist-public' : 'dist-web') } = {}) {
  projectRoot = path.resolve(projectRoot); sourceRoot = path.resolve(sourceRoot); outputRoot = path.resolve(outputRoot);
  const sourceNames = await listFiles(sourceRoot);
  const publicData = publicBuild || !catalogFiles.every(name => sourceNames.includes(name));
  if (!inside(projectRoot, outputRoot) || outputRoot === sourceRoot || inside(sourceRoot, outputRoot) || inside(outputRoot, sourceRoot))
    throw new Error('Web output must be a separate project subdirectory outside the web source directory.');
  await rejectOutputLinks(projectRoot, outputRoot);
  try {
    const existing = await fs.readdir(outputRoot);
    if (existing.some(name => !['releases', 'index.html', 'sw.js', 'release.json', '_headers'].includes(name) && !/^(?:index\.html|sw\.js|release\.json)\.(?:gz|br)$/.test(name)))
      throw new Error('Web output contains unrelated files; choose an empty directory or an existing web build.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of sourceNames) if (name !== 'sw.js' && !allowedBrowserPath(name)) throw new Error(`Unexpected file in web source: ${name}`);
  for (const required of ['index.html', 'app.js', 'runtime-config.js', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'sw.js'])
    if (!sourceNames.includes(required)) throw new Error(`Missing web source: ${required}`);
  const sources = new Map();
  for (const name of sourceNames) {
    if (name.startsWith(gameLocalizationDirectory)) continue;
    if (publicData && (catalogFiles.includes(name) || name === 'data/entity-images.js' || name.startsWith('assets/bitcraft/'))) continue;
    sources.set(name, await fs.readFile(path.join(sourceRoot, name)));
  }
  if (publicData) for (const name of catalogFiles) {
    sources.set(name, await fs.readFile(path.join(projectRoot, 'data/public', path.basename(name))));
  }
  const catalogCommit = JSON.parse(sources.get(catalogFiles[0]).toString()).source.commit;
  const imported = publicBuild ? null : await readGameLocalization(projectRoot, catalogCommit);
  if (publicData) await verifyPublicOutput(projectRoot, outputRoot, publicBuild);
  const gameLocalization = imported && {
    commit: imported.commit, steamBuild: imported.steamBuild, languages: Object.keys(imported.languages)
  };
  if (gameLocalization) for (const language of gameLocalization.languages) {
    const { strings } = imported.languages[language];
    const pack = { language, commit: gameLocalization.commit, strings };
    sources.set(gameLanguageFile(language), Buffer.from(JSON.stringify(pack) + '\n'));
  }
  if (!sources.has('data/entity-images.js')) sources.set('data/entity-images.js', noGameImages);
  const packageInfo = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const remote = publicData ? await readRemoteIcons(projectRoot) : null;
  const imageOrigin = remote ? new URL(remote.baseUrl).origin : undefined;
  const files = new Map(sources); files.delete('sw.js');
  files.set('data/entity-images.js', compactImageIndex(sources.get('data/entity-images.js'), remote));
  const manifest = JSON.parse(files.get('manifest.webmanifest').toString());
  manifest.id = '../../'; manifest.start_url = '../../'; manifest.scope = '../../';
  files.set('manifest.webmanifest', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  const contentHash = createHash('sha256').update('bitcraft-static-release-v1\0').update(packageInfo.version).update('\0');
  // The generator participates in the ID: changing generated HTML/config also changes its immutable URL.
  contentHash.update(await fs.readFile(here));
  // Hash the browser projection, including the reduced image index, rather than its private source metadata.
  for (const [name, bytes] of files) contentHash.update('\0' + name + '\0' + bytes.length + '\0').update(bytes);
  if (gameLocalization) contentHash.update('\0gameLocalization\0').update(JSON.stringify(gameLocalization));
  contentHash.update('\0sw.js\0').update(sources.get('sw.js'));
  const release = contentHash.digest('hex').slice(0, 24);
  const releaseBase = `releases/${release}/`;
  const localizationConfig = gameLocalization ? `,gameLocalization:${JSON.stringify(gameLocalization)}` : '';
  files.set('runtime-config.js', Buffer.from(`// Generated web release configuration.\nexport const runtimeConfig=Object.freeze({release:${JSON.stringify(release)},catalogCommit:${JSON.stringify(catalogCommit)}${localizationConfig},assetBase:new URL('./',import.meta.url).href});\nexport const appBase=new URL('../../',import.meta.url).href;\nexport const assetUrl=path=>new URL(path,runtimeConfig.assetBase).href;\n`));
  const html = rootHtml(files.get('index.html').toString(), releaseBase, imageOrigin);
  files.set('shell.html', Buffer.from(html));
  const presets = new Set(presetImageFiles(sources));
  for (const name of presets) if (!files.has(name)) throw new Error(`Missing offline preset image: ${name}`);
  const core = [...files.keys()].filter(name => name !== 'index.html' && (!/\.(?:webp|jpe?g)$/.test(name) || presets.has(name))).sort().map(name => releaseBase + name);
  const imageFiles = [...files.keys()].filter(name => /\.webp$/.test(name)).sort().map(name => releaseBase + name);
  const assets = [];
  const write = async (relative, bytes, immutable = false) => {
    await writeFile(path.join(outputRoot, relative), bytes, immutable, projectRoot);
    if (compressible(relative) && bytes.length >= 512) {
      const compressed = {
        gz: gzipSync(bytes, { level: 9 }),
        br: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
      };
      for (const [extension, packed] of Object.entries(compressed)) {
        if (packed.length < bytes.length) await writeFile(path.join(outputRoot, relative + '.' + extension), packed, immutable, projectRoot);
        else if (!immutable) await fs.rm(path.join(outputRoot, relative + '.' + extension), { force: true });
      }
    } else if (!immutable && compressible(relative)) {
      for (const extension of ['gz', 'br']) await fs.rm(path.join(outputRoot, relative + '.' + extension), { force: true });
    }
  };
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    await write(releaseBase + name, bytes, true);
    assets.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
  }
  const releaseManifest = {
    formatVersion: 1, version: packageInfo.version, release, releaseBase, publicData,
    ...(imageOrigin ? { imageOrigin } : {}), ...(gameLocalization ? { gameLocalization } : {}), files: assets
  };
  await writeFile(path.join(outputRoot, releaseBase, 'asset-manifest.json'), JSON.stringify(releaseManifest, null, 2) + '\n', true, projectRoot);
  const sw = Buffer.from(`// Generated release constants. URLs are relative to the service worker scope.\nconst RELEASE=${JSON.stringify(release)};\nconst RELEASE_BASE=${JSON.stringify(releaseBase)};\nconst CORE=${JSON.stringify(core)};\nconst IMAGE_FILES=${JSON.stringify(imageFiles)};\n` + sources.get('sw.js').toString());
  // Immutable release resources are complete before the mutable entry points change.
  await write('index.html', Buffer.from(html));
  await write('sw.js', sw);
  const metadata = { ...releaseManifest, core, imageFiles };
  await write('release.json', Buffer.from(JSON.stringify(metadata, null, 2) + '\n'));
  await writeFile(path.join(outputRoot, '_headers'), staticHostHeaders(imageOrigin), false, projectRoot);
  return { ...metadata, outputRoot };
}

if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  try {
    let outputRoot, publicBuild = false;
    for (let i = 2; i < process.argv.length; i++) {
      if (process.argv[i] === '--output' && process.argv[i + 1]) outputRoot = path.resolve(process.argv[++i]);
      else if (process.argv[i] === '--public') publicBuild = true;
      else throw new Error(`Unknown argument: ${process.argv[i]}`);
    }
    const result = await buildWeb({ outputRoot, publicBuild });
    console.log(`Built web release ${result.release}: ${result.files.length} files in ${result.outputRoot}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
