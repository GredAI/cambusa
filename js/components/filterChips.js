/* =====================================================
   CAMBUSA — components/filterChips.js
   Barra filtri categoria per la lista spese.
   ===================================================== */

import { CAT_CONFIG } from './expenseCard.js';

/**
 * @param {string[]} categories   — elenco id categorie presenti
 * @param {string}   activeFilter — id categoria attivo, 'all' = tutte
 */
export function FilterChips(categories, activeFilter) {
  const chips = categories.map(c => {
    const cfg = CAT_CONFIG[c] ?? { icon: '📦', label: c };
    return `
      <button class="filter-chip ${activeFilter === c ? 'filter-chip--active' : ''}"
              data-filter="${c}">
        ${cfg.icon} ${cfg.label}
      </button>`;
  }).join('');

  return `
    <div class="filter-row" id="filter-row">
      <button class="filter-chip ${activeFilter === 'all' ? 'filter-chip--active' : ''}"
              data-filter="all">Tutte</button>
      ${chips}
    </div>`;
}
