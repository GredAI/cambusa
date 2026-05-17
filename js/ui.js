/* =====================================================
   CAMBUSA — ui.js
   Render.screen() + componenti condivisi riutilizzabili:
   Topbar(), BottomNav()
   ===================================================== */

// ── Logo SVG ──────────────────────────────────────────────
/**
 * Logomark "C" di Cambusa — anello diviso in tre archi brand.
 *
 * @param {object} opts
 * @param {string} [opts.size]       CSS width/height (default '40px')
 * @param {string} [opts.bg]         colore sfondo cerchio opzionale (default: none)
 * @param {string} [opts.extraClass] classe CSS aggiuntiva
 */
export function CambusaLogo({ size = '40px', bg = '', extraClass = '' } = {}) {
  const bgCircle = bg
    ? `<circle cx="50" cy="50" r="50" fill="${bg}"/>`
    : '';
  return `
    <svg class="cambusa-logo ${extraClass}" xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="Cambusa">
      ${bgCircle}
      <path d="M 61.129 91.535 A 43 43 0 1 1 61.129 8.465 L 55.823 28.267 A 22.5 22.5 0 1 0 55.823 71.733 Z" fill="#1D3844"/>
      <path d="M 85.224 74.664 A 43 43 0 0 1 61.129 91.535 L 55.823 71.733 A 22.5 22.5 0 0 0 68.431 62.905 Z" fill="#2FA7A0"/>
      <path d="M 61.129 8.465 A 43 43 0 0 1 85.224 25.336 L 68.431 37.095 A 22.5 22.5 0 0 0 55.823 28.267 Z" fill="#F47461"/>
    </svg>`;
}

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
    { id: 'home',     icon: '🏠', label: 'Home'   },
    { id: 'expenses', icon: '🧾', label: 'Spese'  },
    { id: 'fab',      icon: '+',  label: ''        },
    { id: 'balances', icon: '💰', label: 'Saldi'  },
    { id: 'settings', icon: '⚙️', label: 'Altro'  },
  ];

  return `
    <nav class="bottom-nav">
      ${items.map(item => {
        if (item.id === 'fab') {
          return `<button class="fab-main" data-nav="new-expense">+</button>`;
        }
        return `
          <button class="nav-item ${active === item.id ? 'active' : ''}" data-nav="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </button>`;
      }).join('')}
    </nav>`;
}
