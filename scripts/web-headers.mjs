import path from 'node:path';

export const securityHeaders = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
});

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};
export const mimeType = filename => types[path.extname(filename)] || 'application/octet-stream';
export const compressible = filename => /\.(?:html|js|css|json|svg|webmanifest)$/.test(filename);
export const immutablePath = filename => /^releases\/[a-f0-9]{24}\//.test(filename);
export const cacheControl = filename => immutablePath(filename) ? 'public, max-age=31536000, immutable' : 'no-cache';

// Deliberately narrow: a project root or arbitrary development file is never a web root.
export function allowedBrowserPath(filename) {
  return /^(?:index\.html|shell\.html|manifest\.webmanifest|[a-z][a-z0-9-]*\.(?:js|css|svg|ico))$/.test(filename)
    || /^data\/(?:recipe-catalog\.json|catalog-ru\.json|entity-images\.js)$/.test(filename)
    || /^icons\/[a-zA-Z0-9_-]+\.(?:png|svg|ico)$/.test(filename)
    || /^assets\/bitcraft\/files\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/.test(filename);
}

export function isHttpsImageOrigin(value) {
  return typeof value === 'string' && /^https:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d+)?$/i.test(value);
}

export function releaseSecurityHeaders(imageOrigin) {
  if (!imageOrigin) return securityHeaders;
  if (!isHttpsImageOrigin(imageOrigin) || new URL(imageOrigin).origin !== imageOrigin) throw new Error('Invalid release image origin.');
  return {
    ...securityHeaders,
    'Content-Security-Policy': securityHeaders['Content-Security-Policy'].replace("img-src 'self' data:;", `img-src 'self' data: ${imageOrigin};`)
  };
}

export function staticHostHeaders(imageOrigin) {
  const common = Object.entries(releaseSecurityHeaders(imageOrigin)).map(([name, value]) => `  ${name}: ${value}`).join('\n');
  return `# Apply these rules at the application's mount path if deployed in a subdirectory.\n/*\n${common}\n  Cache-Control: no-cache\n\n/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/sw.js\n  Cache-Control: no-cache\n`;
}

/** null means identity is forbidden and no available encoding is acceptable. */
export function chooseEncoding(header, available = new Set(['br', 'gzip'])) {
  if (!header) return 'identity';
  const qualities = new Map();
  for (const part of String(header).split(',')) {
    const [rawName, ...parameters] = part.trim().toLowerCase().split(';');
    const name = rawName.trim();
    if (!name) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const match = parameter.trim().match(/^q\s*=\s*(.*)$/);
      if (match) quality = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(match[1]) ? Number(match[1]) : 0;
    }
    qualities.set(name, quality);
  }
  const quality = name => qualities.get(name) ?? qualities.get('*') ?? 0;
  const candidates = ['br', 'gzip'].filter(name => available.has(name) && quality(name) > 0);
  candidates.sort((a, b) => quality(b) - quality(a));
  const identityQuality = qualities.get('identity');
  if (identityQuality > 0 && (!candidates.length || identityQuality > quality(candidates[0]))) return 'identity';
  if (candidates.length) return candidates[0];
  return identityQuality === 0 || (identityQuality === undefined && qualities.get('*') === 0) ? null : 'identity';
}
