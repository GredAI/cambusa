/* =====================================================
   CAMBUSA — components/filterChips.js
   Barra filtri categoria per la lista spese.
   ===================================================== */

import { catIcon, CAT_LABEL } from './catIcon.js';

/**
 * @param {string[]} categories   — elenco id categorie presenti
 * @param {string}   activeFilter — id categoria attivo, 'all' = tutte
 */
export function FilterChips(categories, activeFilter) {
  const chips = categories.map(c => {
    const safecat = c || 'altro';
    const label   = CAT_LABEL[safecat] ?? safecat;
    return `
      <button class="filter-chip ${activeFilter === safecat ? 'filter-chip--active' : ''}"
              data-filter="${safecat}">
        ${catIcon(safecat, 15)} ${label}
      </button>`;
  }).join('');

  return `
    <div class="filter-row" id="filter-row">
      <button class="filter-chip ${activeFilter === 'all' ? 'filter-chip--active' : ''}"
              data-filter="all">Tutte</button>
      ${chips}
    </div>`;
}
