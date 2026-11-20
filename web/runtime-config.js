// Source module defaults. The website build supplies the versioned release URLs.
export const runtimeConfig = Object.freeze({
  release: 'source',
  assetBase: new URL('./', import.meta.url).href
});

export const appBase = runtimeConfig.assetBase;
export const assetUrl = path => new URL(path, runtimeConfig.assetBase).href;
