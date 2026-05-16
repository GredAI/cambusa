/* =====================================================
   CAMBUSA — ui.js
   Render.screen() + componenti condivisi riutilizzabili:
   Topbar(), BottomNav()
   ===================================================== */

// ── Render ────────────────────────────────────────────────
let _activeScreen = null;

export const Render = {
  screen(Screen) {
    _activeScreen?.unmount?.();
    document.getElementById('app').innerHTML = Screen.html();
    _activeScreen = Screen;
    Screen.mount?.();
  },
};

// ── Topbar ────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string}  opts.title
 * @param {string}  [opts.subtitle]
 * @param {boolean} [opts.back]      - mostra freccia ←
 * @param {string}  [opts.backNav]   - screen a cui torna (default: 'home')
 * @param {string}  [opts.right]     - HTML opzionale a destra
 */
export function Topbar({ title, subtitle = '', back = false, backNav = 'home', right = '' } = {}) {
  return `
    <header class="topbar ${back ? 'topbar--back' : ''}">
      ${back ? `<button class="btn-back" data-nav="${backNav}">←</button>` : ''}
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
