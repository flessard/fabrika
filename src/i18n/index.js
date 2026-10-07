// Langues du jeu : tous les textes affichés passent par t('clé', { paramètres }).
//
// Les dictionnaires (fr.js, en.js) associent une clé à un texte ; {nom} y est remplacé
// par le paramètre du même nom. Une clé qui manque dans une langue retombe sur le français.
//
// Ajouter une langue : copier fr.js, le traduire, l'ajouter à LANGS ci-dessous.
import { emit } from '../core/events.js';
import fr from './fr.js';
import en from './en.js';

/** Langues proposées, avec leur nom dans leur propre langue. */
export const LANGS = { fr: { name: 'Français', texts: fr }, en: { name: 'English', texts: en } };

const STORAGE_KEY = 'fabrika.lang';
let lang = initialLang();

/** Langue choisie la dernière fois, sinon celle du navigateur (français ou anglais). */
function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved in LANGS) return saved;
  } catch { /* stockage indisponible (navigation privée…) */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const getLang = () => lang;

/** Change de langue, la retient, et prévient l'interface (événement 'lang:changed'). */
export function setLang(next) {
  if (!(next in LANGS) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* pas grave : elle ne sera pas retenue */ }
  document.documentElement.lang = next;
  emit('lang:changed', next);
}

/** Texte de la clé dans la langue actuelle, avec ses {paramètres} remplacés. */
export function t(key, params = {}) {
  const text = LANGS[lang].texts[key] ?? fr[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in params ? params[name] : `{${name}}`));
}

/** Singulier ou pluriel : la clé `<key>.one` quand n vaut 1 (ou 0 en français), sinon `<key>.other`. */
export function tn(key, n, params = {}) {
  const one = lang === 'fr' ? n < 2 : n === 1;
  return t(`${key}.${one ? 'one' : 'other'}`, { n, ...params });
}

/** Nombre à virgule : « 1,3 » en français, « 1.3 » en anglais. */
export const decimal = (n, digits = 1) => {
  const text = n.toFixed(digits);
  return lang === 'fr' ? text.replace('.', ',') : text;
};

// Noms des choses du jeu (les données n'ont que des identifiants).
export const buildingName = (type) => t(`building.${type}`);
export const itemName = (type) => t(`item.${type}`);
export const itemPlural = (type) => t(`item.${type}.plural`);
export const shapeLabel = (shapeId) => t(`shape.${shapeId}`);
export const toolName = (toolId) => t(`tool.${toolId}`);

document.documentElement.lang = lang;
