export const catalogLocales = Object.freeze({
  ru: { label: 'Русский', locale: 'ru-RU', asset: 'ru' },
  en: { label: 'English', locale: 'en-US' },
  de: { label: 'Deutsch', locale: 'de-DE', asset: 'de' },
  'es-419': { label: 'Español (Latinoamérica)', locale: 'es-419', asset: 'es' },
  fr: { label: 'Français', locale: 'fr-FR', asset: 'fr' },
  ja: { label: '日本語', locale: 'ja-JP', asset: 'jp' },
  pl: { label: 'Polski', locale: 'pl-PL', asset: 'pl' },
  'pt-BR': { label: 'Português (Brasil)', locale: 'pt-BR', asset: 'pt-BR' },
  'zh-Hans': { label: '简体中文', locale: 'zh-Hans', asset: 'zh-Hans' },
  'zh-Hant': { label: '繁體中文', locale: 'zh-Hant', asset: 'zh-Hant' }
});

export const gameLanguageFile = language => `data/game-localization/${language}.json`;
