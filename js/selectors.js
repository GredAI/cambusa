/* =====================================================
   CAMBUSA — selectors.js  (Ledger V3)
   Unico punto di accesso per leggere e derivare dati
   da State. Gli screen non accedono mai a State
   direttamente per logica di dominio — usano Selectors.

   REGOLE
   ─────────────────────────────────────────────────────
   • Solo lettura — nessuna mutazione
   • Nessun accesso a DB
   • Nessun side effect
   ===================================================== */

import { State }  from './state.js';
import * as Guards from './domain/guards.js';

// ── Cache memoization ─────────────────────────────────
let _groupedExpensesCacheKey = null;
let _groupedExpensesCache    = null;

export const Selectors = {

  // ── Trips ─────────────────────────────────────────────

  trips() {
    return State.trips;
  },

  currentTrip() {
    return State.currentTrip;
  },

  // ── Participants ──────────────────────────────────────

  participant(participantId) {
    return State.currentTrip?.participants.find(p => p.id === participantId) ?? null;
  },

  participants() {
    return State.currentTrip?.participants ?? [];
  },

  participantStartDate(participant) {
    return State.getParticipantStartDate(participant, State.currentTrip);
  },

  participantEndDate(participant) {
    return State.getParticipantEndDate(participant, State.currentTrip);
  },

  // ── Expenses ──────────────────────────────────────────

  expensesSortedByDate() {
    return [...State.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  /**
   * Spese raggruppate per data, opzionalmente filtrate per categoria.
   * MEMOIZZATO per State.expensesRevision.
   *
   * @param {string|null} category — null = tutte
   * @returns {Array<{ date, label, expenses, total }>}
   */
  groupedExpenses(category = null) {
    const cacheKey = `${State.expensesRevision}:${category ?? '*'}`;
    if (cacheKey === _groupedExpensesCacheKey) return _groupedExpensesCache;

    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const todayMs   = new Date(today).getTime();

    let list = Selectors.expensesSortedByDate().filter(Guards.isGroupExpense);
    if (category) {
      list = list.filter(e => e.category === category);
    }

    const map = new Map();
    for (const e of list) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }

    const result = [...map.entries()].map(([date, exps]) => {
      const daysDiff = Math.round((todayMs - new Date(date).getTime()) / 86_400_000);
      let label;
      if      (date === today)               label = 'Oggi';
      else if (date === yesterday)           label = 'Ieri';
      else if (daysDiff > 0 && daysDiff < 7) label = Selectors.formatDate(date, { weekday: 'long' });
      else                                   label = Selectors.formatDate(date, { day: 'numeric', month: 'long' });

      return { date, label, expenses: exps, total: exps.reduce((s, e) => s + Guards.readAmount(e), 0) };
    });

    _groupedExpensesCacheKey = cacheKey;
    _groupedExpensesCache    = result;
    return result;
  },

  /** Numero spese attive del trip corrente (no deleted) — per badge */
  activeGroupExpenseCount() {
    return State.expenses.filter(Guards.isGroupExpense).length;
  },

  /** Categorie presenti nelle spese attive correnti */
  expenseCategories() {
    return [...new Set(State.expenses.filter(Guards.isGroupExpense).map(e => e.category))];
  },

  /** Totale spese attive del trip corrente */
  tripTotal() {
    return State.expenses.filter(Guards.isGroupExpense).reduce((s, e) => s + Guards.readAmount(e), 0);
  },

  /** Totale spese attive per un trip qualsiasi (per home screen) */
  tripTotalById(tripId) {
    return State.allExpenses
      .filter(e => e.tripId === tripId && Guards.isGroupExpense(e))
      .reduce((s, e) => s + Guards.readAmount(e), 0);
  },

  /** Numero spese attive per un trip qualsiasi (per home screen) */
  tripExpenseCountById(tripId) {
    return State.allExpenses.filter(e => e.tripId === tripId && Guards.isGroupExpense(e)).length;
  },

  /** Totale per categoria (solo spese attive) */
  categoryTotals() {
    return State.expenses.filter(Guards.isGroupExpense).reduce((map, e) => {
      map[e.category] = (map[e.category] || 0) + Guards.readAmount(e);
      return map;
    }, {});
  },

  /** Spese filtrate per categoria */
  expensesByCategory(category) {
    return State.expenses.filter(e => e.category === category && Guards.isGroupExpense(e));
  },

  // ── Balances (derived, mai persistiti) ───────────────

  balances() {
    if (!State.currentTrip) return [];
    return State.balances(State.currentTrip, State.expenses, State.settlements);
  },

  participantBalance(participantId) {
    return Selectors.balances().find(b => b.participant.id === participantId) ?? null;
  },

  suggestedSettlements() {
    if (!State.currentTrip) return [];
    return State.suggestedSettlements(State.currentTrip, State.expenses, State.settlements);
  },

  giftSummary() {
    if (!State.currentTrip) return [];
    return State.giftSummary(State.currentTrip, State.expenses);
  },

  // ── Formatting ────────────────────────────────────────

  /**
   * Formatta centesimi in stringa leggibile.
   * @param {number} cents — es. 2150 → "21,50€"
   */
  formatCurrency(cents, currency) {
    const cur = currency ?? State.currentTrip?.currency ?? '€';
    const fmt = ((cents ?? 0) / 100).toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${fmt}${cur}`;
  },

  formatDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'long' }) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', opts);
  },

  formatDateShort(iso) {
    return Selectors.formatDate(iso, { day: 'numeric', month: 'short' });
  },
};
