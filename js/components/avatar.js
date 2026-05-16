/* =====================================================
   CAMBUSA — components/avatar.js
   Genera HTML per l'avatar di un partecipante.

   Strategia a due livelli:
   • Lettera iniziale colorata (sempre visibile, fallback offline)
   • Immagine DiceBear sovrapposta (caricata se online)

   L'img è position:absolute sopra l'iniziale; se non si
   carica (offline o errore), l'iniziale rimane visibile.
   ===================================================== */

const DICEBEAR_BASE = 'https://api.dicebear.com/9.x/avataaars/svg';

/**
 * URL DiceBear per un nome dato.
 * @param {string} name
 * @returns {string}
 */
export function avatarUrl(name) {
  const seed = encodeURIComponent((name || '?').trim());
  return `${DICEBEAR_BASE}?seed=${seed}&backgroundColor=transparent`;
}

/**
 * HTML completo per un avatar partecipante.
 *
 * @param {object} participant   — oggetto con { name, color }
 * @param {string} [modifier]    — classe BEM aggiuntiva, es. 'avatar--sm'
 * @returns {string} HTML string
 */
export function participantAvatar(participant, modifier = '') {
  const name    = participant?.name  ?? '?';
  const color   = participant?.color ?? '#888';
  const initial = name.charAt(0).toUpperCase();
  const url     = avatarUrl(name);
  const cls     = ['avatar', modifier].filter(Boolean).join(' ');

  return `<div class="${cls}" style="background:${color}" data-avatar-name="${initial}">
    <img src="${url}" alt="${initial}" class="avatar__img" loading="lazy"
         onerror="this.style.display='none'">
  </div>`;
}

/**
 * Aggiorna un elemento avatar già nel DOM (usato da tripForm dopo rename).
 * @param {HTMLElement} el
 * @param {object} participant
 */
export function updateAvatarEl(el, participant) {
  if (!el) return;
  const name    = participant?.name  ?? '?';
  const color   = participant?.color ?? '#888';
  const initial = name.charAt(0).toUpperCase();

  el.style.background = color;
  el.dataset.avatarName = initial;

  const img = el.querySelector('.avatar__img');
  if (img) {
    img.src   = avatarUrl(name);
    img.alt   = initial;
    img.style.display = '';   // ripristina se era nascosto da onerror
  }
}
