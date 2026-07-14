// Stub localStorage ringkas untuk persekitaran Node (Vitest environment: node).
// Modul news.js/journal.js/alerts.js guna localStorage; sediakan di sini.
const kedai = new Map();

globalThis.localStorage = {
  getItem: (k) => (kedai.has(k) ? kedai.get(k) : null),
  setItem: (k, v) => kedai.set(k, String(v)),
  removeItem: (k) => kedai.delete(k),
  clear: () => kedai.clear(),
  get length() {
    return kedai.size;
  },
  key: (i) => Array.from(kedai.keys())[i] ?? null,
};
