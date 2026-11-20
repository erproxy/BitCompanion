import { messagesEn } from './messages-en.js';

export const LANGUAGE_KEY = 'bitcraft-companion-language';
const languages = new Set(['ru', 'en']);
let language = 'ru';
const numbers = new Map();

export function resolveLanguage(preference, systemLanguages = []) {
  if (languages.has(preference)) return preference;
  for (const tag of systemLanguages) {
    const code = String(tag).toLowerCase().split(/[-_]/)[0];
    if (languages.has(code)) return code;
  }
  return 'en';
}

export function setLanguage(preference, systemLanguages) {
  language = resolveLanguage(preference, systemLanguages);
  return language;
}

export const currentLanguage = () => language;
export const locale = () => language === 'ru' ? 'ru-RU' : 'en-US';
export const languagePreference = value => languages.has(value) ? value : 'system';

export function readLanguagePreference() {
  try { return languagePreference(localStorage.getItem(LANGUAGE_KEY)); }
  catch { return 'system'; }
}

export function storeLanguagePreference(preference) {
  try {
    if (preference === 'system') localStorage.removeItem(LANGUAGE_KEY);
    else localStorage.setItem(LANGUAGE_KEY, preference);
  } catch { /* A denied store still allows switching for this session. */ }
}

// Source messages are keys. Values are only interpolated after selecting a
// locale, so user text, links, and formatted numbers are never translated.
export function t(message, ...values) {
  if (message == null) return '';
  const text = language === 'en' && Object.hasOwn(messagesEn, message) ? messagesEn[message] : String(message);
  return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match) : text;
}

export function localizeDefault(value, source) {
  return value === source || value === messagesEn[source] ? t(source) : value;
}

export function formatNumber(value, digits = 0) {
  const key = `${language}/${digits}`;
  if (!numbers.has(key)) numbers.set(key, new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }));
  return numbers.get(key).format(value);
}

export function formatDate(value, options = { year: 'numeric', month: '2-digit', day: '2-digit' }) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(value).toLocaleDateString(locale(), date ? { ...options, timeZone: 'UTC' } : options);
}
