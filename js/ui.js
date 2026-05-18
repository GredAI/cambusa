/* =====================================================
   CAMBUSA — ui.js
   Render.screen() + componenti condivisi riutilizzabili:
   Topbar(), BottomNav()
   ===================================================== */

// ── Logo SVG ──────────────────────────────────────────────
/**
 * Logomark "C" di Cambusa — anello diviso in tre archi brand.
 * Il dot coral marca il punto di apertura dell'anello (gap top-right).
 *
 * @param {object} opts
 * @param {string} [opts.size]       CSS width/height (default '40px')
 * @param {string} [opts.bg]         colore sfondo cerchio opzionale (default: none)
 * @param {string} [opts.extraClass] classe CSS aggiuntiva
 * @param {boolean}[opts.dot]        mostra il dot marker (default: true)
 */
export function CambusaLogo({ size = '40px', bg = '', extraClass = '', dot = true } = {}) {
  const bgCircle = bg
    ? `<circle cx="50" cy="50" r="50" fill="${bg}"/>`
    : '';
  const dotMark = dot
    ? `<circle cx="73" cy="17" r="5" fill="#F47461"/>`
    : '';
  return `
    <svg class="cambusa-logo ${extraClass}" xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Cambusa">
      ${bgCircle}
      <path d="M 61.129 91.535 A 43 43 0 1 1 61.129 8.465 L 55.823 28.267 A 22.5 22.5 0 1 0 55.823 71.733 Z" fill="#1D3844"/>
      <path d="M 85.224 74.664 A 43 43 0 0 1 61.129 91.535 L 55.823 71.733 A 22.5 22.5 0 0 0 68.431 62.905 Z" fill="#2FA7A0"/>
      <path d="M 61.129 8.465 A 43 43 0 0 1 85.224 25.336 L 68.431 37.095 A 22.5 22.5 0 0 0 55.823 28.267 Z" fill="#F47461"/>
      ${dotMark}
    </svg>`;
}

// ── Nav icon pack (SVG outline) ───────────────────────────
const _NAV_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
           <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"/>
           <path d="M9 21v-8h6v8"/>
         </svg>`,
  expenses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
               <rect x="5" y="2" width="14" height="20" rx="2"/>
               <line x1="9" y1="7" x2="15" y2="7"/>
               <line x1="9" y1="11" x2="15" y2="11"/>
               <line x1="9" y1="15" x2="13" y2="15"/>
             </svg>`,
  balances: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
               <rect x="2"   y="13" width="5" height="8" rx="1"/>
               <rect x="9.5" y="7"  width="5" height="14" rx="1"/>
               <rect x="17"  y="10" width="5" height="11" rx="1"/>
             </svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
               <circle cx="12" cy="12" r="3"/>
               <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06
                        a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09
                        A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06
                        A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09
                        A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06
                        A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09
                        a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06
                        A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09
                        a1.65 1.65 0 00-1.51 1z"/>
             </svg>`,
};

// ── Theme ─────────────────────────────────────────────────
/**
 * Applica il tema chiaro/scuro impostando data-theme su <html>.
 * @param {'light'|'dark'} theme
 */
export function applyTheme(theme = 'light') {
  document.documentElement.dataset.theme = theme;
}

// ── Render ────────────────────────────────────────────────
let _activeScreen = null;

export const Render = {
  screen(Screen) {
    _activeScreen?.unmount?.();
    document.getElementById('app').innerHTML = Screen.html();

    // Wrap .screen contents in .screen-inner so nav stays at bottom
    // even on short pages — without putting display:flex on the scroll
    // container (which triggers an iOS Safari touch-event bug).
    const screenEl = document.querySelector('.screen');
    if (screenEl) {
      const inner = document.createElement('div');
      inner.className = 'screen-inner';
      while (screenEl.firstChild) inner.appendChild(screenEl.firstChild);
      screenEl.appendChild(inner);
    }

    _activeScreen = Screen;
    Screen.mount?.();
  },
};

// ── Topbar ────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}  opts.title
 * @param {string}  [opts.subtitle]
 * @param {string}  [opts.logo]      - HTML SVG logo opzionale (prima del titolo)
 * @param {boolean} [opts.back]      - mostra freccia ←
 * @param {string}  [opts.backNav]   - screen a cui torna (default: 'home')
 * @param {string}  [opts.right]     - HTML opzionale a destra
 */
export function Topbar({ title, subtitle = '', logo = '', back = false, backNav = 'home', right = '' } = {}) {
  return `
    <header class="topbar ${back ? 'topbar--back' : ''} ${logo ? 'topbar--logo' : ''}">
      ${back ? `<button class="btn-back" data-nav="${backNav}">←</button>` : ''}
      ${logo ? `<div class="topbar__logo">${logo}</div>` : ''}
      <div class="topbar__text">
        <h1 class="topbar__title">${title}</h1>
        ${subtitle ? `<p class="topbar__sub">${subtitle}</p>` : ''}
      </div>
      ${right ? `<div class="topbar__right">${right}</div>` : ''}
    </header>`;
}

// ── BottomNav ─────────────────────────────────────────────
/**
 * @param {string} active - id della voce attiva: 'home' | 'expenses' | 'balances'
 */
export function BottomNav(active = '') {
  const items = [
    { id: 'home',     label: 'Home'  },
    { id: 'expenses', label: 'Spese' },
    { id: 'fab',      label: ''      },
    { id: 'balances', label: 'Saldi' },
    { id: 'settings', label: 'Altro' },
  ];

  const fab = `
    <button class="fab-main" data-nav="new-expense" aria-label="Nuova spesa">
      <svg class="fab-ring" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
        <path d="M 36 5 A 31 31 0 1 0 67 36" stroke="#2FA7A0" stroke-width="3"
              fill="none" stroke-linecap="round"/>
        <path d="M 67 36 A 31 31 0 0 0 36 5" stroke="#F47461" stroke-width="3"
              fill="none" stroke-linecap="round"/>
        <circle cx="36" cy="5" r="3.5" fill="#F47461"/>
        <circle cx="67" cy="36" r="3.5" fill="#2FA7A0"/>
      </svg>
      <svg class="fab-plus" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="12" y1="5" x2="12" y2="19" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="5"  y1="12" x2="19" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    </button>`;

  return `
    <nav class="bottom-nav">
      ${items.map(item => {
        if (item.id === 'fab') return fab;
        const isActive = active === item.id;
        const arcSvg = isActive
          ? `<svg class="nav-arc" viewBox="0 0 28 4" xmlns="http://www.w3.org/2000/svg">
               <path d="M 2 3.5 Q 14 0.5 26 3.5" stroke="#2FA7A0" stroke-width="2"
                     fill="none" stroke-linecap="round"/>
             </svg>`
          : '';
        return `
          <button class="nav-item ${isActive ? 'active' : ''}" data-nav="${item.id}">
            ${arcSvg}
            <span class="nav-icon">${_NAV_ICONS[item.id]}</span>
            <span class="nav-label">${item.label}</span>
          </button>`;
      }).join('')}
    </nav>`;
}
