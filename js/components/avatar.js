/* =====================================================
   CAMBUSA — components/avatar.js
   Genera HTML per l'avatar di un partecipante.

   Strategia:
   • avatarIndex 0–31 → immagine locale /assets/avatars/avXX.png
   • null / non impostato → lettera iniziale colorata (fallback)
   ===================================================== */

const AVATAR_COUNT = 32;
const AVATAR_BASE  = './assets/avatars/';

/**
 * URL dell'avatar locale dato un indice 0–31.
 * @param {number} index
 * @returns {string}
 */
export function avatarUrl(index) {
  const i = Math.max(0, Math.min(AVATAR_COUNT - 1, index));
  return `${AVATAR_BASE}av${String(i).padStart(2, '0')}.png`;
}

/**
 * HTML completo per un avatar partecipante.
 *
 * @param {object} participant   — oggetto con { name, color, avatarIndex }
 * @param {string} [modifier]    — classe BEM aggiuntiva, es. 'avatar--sm'
 * @returns {string} HTML string
 */
export function participantAvatar(participant, modifier = '') {
  const name    = participant?.name  ?? '?';
  const color   = participant?.color ?? '#10b981';
  const idx     = participant?.avatarIndex;
  const initial = name.charAt(0).toUpperCase();
  const cls     = ['avatar', modifier].filter(Boolean).join(' ');

  if (idx !== null && idx !== undefined) {
    // Avatar locale
    return `<div class="${cls}" style="background:#e5e7eb" data-avatar-name="${initial}">
      <img src="${avatarUrl(idx)}" alt="${_h(name)}" class="avatar__img" loading="lazy"
           onerror="this.style.display='none'">
    </div>`;
  }

  // Fallback: iniziale colorata
  return `<div class="${cls}" style="background:${color}" data-avatar-name="${initial}"></div>`;
}

/**
 * Aggiorna un elemento avatar già nel DOM.
 * @param {HTMLElement} el
 * @param {object} participant
 */
export function updateAvatarEl(el, participant) {
  if (!el) return;
  const name    = participant?.name  ?? '?';
  const color   = participant?.color ?? '#10b981';
  const idx     = participant?.avatarIndex;
  const initial = name.charAt(0).toUpperCase();

  el.dataset.avatarName = initial;

  const img = el.querySelector('.avatar__img');

  if (idx !== null && idx !== undefined) {
    el.style.background = '#e5e7eb';
    if (img) {
      img.src   = avatarUrl(idx);
      img.style.display = '';
    } else {
      // Crea img se non esiste
      const newImg = document.createElement('img');
      newImg.src       = avatarUrl(idx);
      newImg.alt       = initial;
      newImg.className = 'avatar__img';
      newImg.loading   = 'lazy';
      newImg.onerror   = () => { newImg.style.display = 'none'; };
      el.appendChild(newImg);
    }
  } else {
    el.style.background = color;
    if (img) img.style.display = 'none';
  }
}

function _h(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
