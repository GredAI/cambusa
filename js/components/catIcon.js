/* =====================================================
   CAMBUSA — catIcon.js
   Icone SVG outline per le categorie di spesa.
   Stroke 2px, round caps/join, currentColor.
   Zero emoji, zero dipendenze.
   ===================================================== */

const _ICONS = {

  alloggio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <path d="M3 11.5L12 4l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V11.5z"/>
    <path d="M9 22v-8h6v8"/>
  </svg>`,

  trasporti: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="7" width="20" height="11" rx="2"/>
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
    <circle cx="7.5" cy="18.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="16.5" cy="18.5" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M2 12h20"/>
  </svg>`,

  noleggi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <path d="M3 17l2-8h14l2 8"/>
    <path d="M5 17a7 7 0 0014 0"/>
    <path d="M12 9V5"/>
    <path d="M8.5 5.5l3.5 3.5 3.5-3.5"/>
  </svg>`,

  cibo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2v7c0 1.7 1.3 3 3 3s3-1.3 3-3V2"/>
    <path d="M6 2v20"/>
    <path d="M18 2c0 0 0 6-3 9v11"/>
  </svg>`,

  spesa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 01-8 0"/>
  </svg>`,

  attivita: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <polygon points="3,20 12,4 21,20"/>
    <polyline points="9,20 12,14 15,20"/>
  </svg>`,

  servizi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12
             M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
  </svg>`,

  altro: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>
    <circle cx="5"  cy="12" r="1" fill="currentColor" stroke="none"/>
  </svg>`,
};

/**
 * Restituisce la stringa HTML dell'icona SVG per la categoria.
 * @param {string} id   — chiave categoria (alloggio, cibo, ecc.)
 * @param {number} size — larghezza/altezza in px (default 20)
 * @returns {string}    — stringa SVG inline
 */
export function catIcon(id, size = 20) {
  const svg = _ICONS[id] ?? _ICONS.altro;
  return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
}

/**
 * Mappa id → label italiana (usata come fallback se non disponibile altrove).
 */
export const CAT_LABEL = {
  alloggio:  'Alloggio',
  trasporti: 'Trasporti',
  noleggi:   'Noleggi',
  cibo:      'Cibo',
  spesa:     'Spesa',
  attivita:  'Attività',
  servizi:   'Servizi',
  altro:     'Altro',
};
