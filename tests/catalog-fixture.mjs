import { existsSync } from 'node:fs';

const local = new URL('../web/data/', import.meta.url);
const hasLocalData = ['recipe-catalog.json', 'catalog-ru.json'].every(file => existsSync(new URL(file, local)));

export const catalogDirectory = hasLocalData ? local : new URL('../data/public/', import.meta.url);
