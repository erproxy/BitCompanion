import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildWeb } from './build-web.mjs';
import { allowedBrowserPath, cacheControl, chooseEncoding, mimeType, releaseSecurityHeaders, securityHeaders } from './web-headers.mjs';

const here = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(here), '..');
const onlineEntry = 'online.html';

export function normalizeBasePath(value = '/') {
  const base = '/' + value.replace(/^\/+|\/+$/g, '') + '/';
  if (base === '//') return '/';
  if (!/^\/(?:[a-zA-Z0-9_~.-]+\/)+$/.test(base) || base.split('/').some(part => part === '.' || part === '..'))
    throw new Error('Base path must contain ordinary URL path segments, for example /companion/.');
  return base;
}

async function publicFiles(root) {
  // A release manifest is mandatory: serving the repository by accident is refused.
  const current = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
  if (current.formatVersion !== 1 || !/^[a-f0-9]{24}$/.test(current.release)) throw new Error('Not a built BitCraft web directory.');
  const files = new Map(['index.html', 'sw.js', 'release.json'].map(name => [name, securityHeaders]));
  let foundCurrent = false;
  const releaseRoot = path.join(root, 'releases');
  for (const entry of await fs.readdir(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]{24}$/.test(entry.name)) continue;
    let metadata;
    try { metadata = JSON.parse(await fs.readFile(path.join(releaseRoot, entry.name, 'asset-manifest.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' && entry.name !== current.release) continue; throw error; }
    if (metadata.release !== entry.name || metadata.releaseBase !== `releases/${entry.name}/` || !Array.isArray(metadata.files))
      throw new Error(`Invalid release manifest: ${entry.name}`);
    const releaseHeaders = releaseSecurityHeaders(metadata.imageOrigin);
    for (const file of metadata.files) {
      if (!allowedBrowserPath(file.path) || file.path === 'sw.js' || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0)
        throw new Error(`Invalid public asset: ${file.path}`);
      files.set(metadata.releaseBase + file.path, releaseHeaders);
    }
    if (entry.name === current.release) {
      files.set('index.html', releaseHeaders);
      foundCurrent = true;
    }
  }
  if (!foundCurrent) throw new Error('The current web release is incomplete. Rebuild before starting preview.');
  return files;
}

function safeRequestPath(rawUrl) {
  const raw = rawUrl.split('?')[0];
  if (!raw.startsWith('/') || raw.startsWith('//') || /%(?:2f|5c|00)/i.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (/[\\\0%]/.test(decoded) || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded;
}

function matchesEtag(header, etag) {
  return header.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
}

export async function createWebServer({ root = path.join(projectRoot, 'dist-web'), port = 4173, host = '127.0.0.1', basePath = '/' } = {}) {
  root = path.resolve(root); basePath = normalizeBasePath(basePath);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  const actualRoot = await fs.realpath(root);
  if (actualRoot !== root) throw new Error('Web root cannot be a symbolic link.');
  const allowed = await publicFiles(root);
  const server = http.createServer(async (request, response) => {
    const headers = { ...securityHeaders };
    const end = (status, message, extra = {}) => {
      const body = Buffer.from(message);
      response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length, ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return end(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      const pathname = safeRequestPath(request.url || '');
      if (!pathname) return end(404, 'Not Found');
      if (basePath !== '/' && pathname === basePath.slice(0, -1))
        return end(308, 'Permanent Redirect', { Location: basePath + ((request.url || '').includes('?') ? '?' + request.url.split('?').slice(1).join('?') : '') });
      if (!pathname.startsWith(basePath)) return end(404, 'Not Found');
      const requested = pathname.slice(basePath.length);
      // The root and index.html can still be controlled by an earlier offline release.
      const relative = !requested || requested === onlineEntry ? 'index.html' : requested;
      const releaseHeaders = allowed.get(relative);
      if (!releaseHeaders) return end(404, 'Not Found');
      Object.assign(headers, releaseHeaders);
      const filename = path.join(root, relative);
      const stat = await fs.stat(filename);
      if (!stat.isFile()) return end(404, 'Not Found');
      const resolved = await fs.realpath(filename);
      if (!resolved.startsWith(actualRoot + path.sep)) return end(404, 'Not Found');
      const packedFiles = new Map();
      for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
        try {
          const packed = await fs.realpath(filename + suffix);
          if (packed.startsWith(actualRoot + path.sep) && (await fs.stat(packed)).isFile()) packedFiles.set(encoding, packed);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const encoding = chooseEncoding(request.headers['accept-encoding'], new Set(packedFiles.keys()));
      if (encoding === null) return end(406, 'No acceptable content encoding', { Vary: 'Accept-Encoding' });
      const bytes = await fs.readFile(encoding === 'identity' ? filename : packedFiles.get(encoding));
      const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
      Object.assign(headers, {
        'Content-Type': mimeType(relative), 'Cache-Control': cacheControl(relative),
        Vary: 'Accept-Encoding', ETag: etag, 'Last-Modified': stat.mtime.toUTCString()
      });
      if (encoding !== 'identity') headers['Content-Encoding'] = encoding;
      const modifiedSince = request.headers['if-modified-since'];
      if ((request.headers['if-none-match'] && matchesEtag(request.headers['if-none-match'], etag))
          || (!request.headers['if-none-match'] && modifiedSince && Number.isFinite(Date.parse(modifiedSince)) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(modifiedSince) / 1000))) {
        response.writeHead(304, headers); return response.end();
      }
      response.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return end(404, 'Not Found');
      console.error(`Web response failed: ${error.message}`); end(500, 'Internal Server Error');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address();
  const url = `http://${host.includes(':') ? '[' + host + ']' : host}:${address.port}${basePath}`;
  return { server, url, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

function openBrowser(url) {
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFile(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BITCRAFT_WEB_URL -ErrorAction Stop'], {
    env: { ...process.env, BITCRAFT_WEB_URL: url }, windowsHide: true
  }, error => {
    if (error) console.error(`Не удалось открыть браузер. Откройте ${url} вручную.`);
  });
}

async function findRunningPreview({ root = path.join(projectRoot, 'dist-web'), port = 4173, host = '127.0.0.1', basePath = '/' }) {
  if (host !== '127.0.0.1' || port === 0) return null;
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
    const shell = metadata.files.find(file => file.path === 'shell.html');
    const script = metadata.files.find(file => file.path === 'app.js');
    if (!shell || !script || !/^[a-f0-9]{24}$/.test(metadata.release)) return null;
    const base = new URL(normalizeBasePath(basePath), `http://${host}:${port}`);
    const entry = new URL(onlineEntry, base);
    const asset = new URL(`releases/${metadata.release}/app.js`, base);
    const requestOptions = {
      method: 'HEAD', headers: { 'Accept-Encoding': 'identity' }, redirect: 'error', signal: AbortSignal.timeout(2000)
    };
    const [entryResponse, scriptResponse] = await Promise.all([fetch(entry, requestOptions), fetch(asset, requestOptions)]);
    const servesCurrentRelease = entryResponse.ok && entryResponse.headers.get('etag') === `"${shell.sha256}"`
      && scriptResponse.ok && scriptResponse.headers.get('etag') === `"${script.sha256}"`;
    return servesCurrentRelease ? entry.href : null;
  } catch { return null; }
}

async function runPreview() {
  const options = {};
  let dev = false, open = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dev') dev = true;
    else if (arg === '--open') open = true;
    else if (['--port', '--host', '--base-path', '--root'].includes(arg) && process.argv[i + 1]) {
      const key = { '--port': 'port', '--host': 'host', '--base-path': 'basePath', '--root': 'root' }[arg];
      options[key] = key === 'port' ? Number(process.argv[++i]) : process.argv[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (open && process.platform !== 'win32') throw new Error('--open is available on Windows.');
  if (dev) await buildWeb({ outputRoot: options.root ? path.resolve(options.root) : undefined });
  let running;
  try { running = await createWebServer(options); }
  catch (error) {
    if (error.code !== 'EADDRINUSE' || !open) throw error;
    const existing = await findRunningPreview(options);
    if (!existing) throw new Error(`Порт ${options.port ?? 4173} занят. Закройте программу, которая его использует, и запустите Start-Web.cmd снова.`);
    console.log(`BitCraft web preview уже запущен: ${existing}`);
    openBrowser(existing);
    return;
  }
  const url = new URL(onlineEntry, running.url).href;
  console.log(`BitCraft web preview: ${url}`);
  if (dev) console.log('Source snapshot built. Restart web:dev after editing source files.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { running.server.close(); });
  if (open) openBrowser(url);
}

if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  try { await runPreview(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
