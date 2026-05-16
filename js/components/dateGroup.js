/* =====================================================
   CAMBUSA — components/dateGroup.js
   Sezione data con header sticky + lista expense card.
   Usata in expenses.js.
   ===================================================== */

import { Selectors }  from '../selectors.js';
import { ExpenseCard } from './expenseCard.js';

/**
 * @param {{ date, label, expenses, total }} group
 * @param {object} trip
 * @param {object|Function} [opts]  — oggetto opzioni o funzione (expense) => opts
 */
export function DateGroup(group, trip, opts = {}) {
  const optsFor = typeof opts === 'function' ? opts : () => opts;
  return `
    <div class="date-group" data-date="${group.date}">
      <div class="date-group__header">
        <span class="date-group__label">${group.label}</span>
        <span class="date-group__total">${Selectors.formatCurrency(group.total)}</span>
      </div>
      <div class="date-group__body">
        ${group.expenses.map(e => ExpenseCard(e, trip, optsFor(e))).join('')}
      </div>
    </div>`;
}
