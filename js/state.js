/* =====================================================
   CAMBUSA — state.js  (Ledger V3)

   PRINCIPIO GUIDA
   ─────────────────────────────────────────────────────
   balances = f(expenses, settlements)

   Ogni spesa genera DUE eventi contabili indipendenti:
     1. DEBIT   → consumers  −quota     (hanno consumato)
     2. CREDIT  → payers     +anticipo  (hanno anticipato)

   Conservazione garantita per costruzione:
     consumerUnit = amount / totalConsumerShares
     payerUnit    = amount / totalPayerShares
     Σ debits = amount = Σ credits  →  Σ netti = 0

   Nessun campo globale su Participant.
   Nessuna logica di delega o liability absorption.
   ===================================================== */

import {
  readAmount,
  isGroupExpense,
  readSettlementAmount,
  readConsumers,
  readPayers,
} from './domain/guards.js';

export const State = {

  currentScreen: 'home',
  params: {},

  trips: [],
  allExpenses: [],
  expenses: [],
  settlements: [],
  settings: {},

  expensesRevision: 0,

  currentTrip: null,

  ui: {
    loading: false,
    modalOpen: false,
  },

  // ─────────────────────────────────────────────────────
  // PARTICIPANT HELPERS
  // ─────────────────────────────────────────────────────

  getParticipantStartDate(participant, trip) {
    return participant.startDate ?? trip.startDate;
  },

  getParticipantEndDate(participant, trip) {
    return participant.endDate ?? trip.endDate;
  },

  // ─────────────────────────────────────────────────────
  // CORE LEDGER  (V3 — consumers + payers)
  // ─────────────────────────────────────────────────────

  /**
   * Calcola il saldo netto di ogni partecipante.
   *
   * Per ogni spesa attiva:
   *   A) DEBIT  ai consumers  → balance -= shares * (amount / totalConsumerShares)
   *   B) CREDIT ai payers     → balance += sharesPaid * (amount / totalPayerShares)
   *
   * Le due voci usano denominatori INDIPENDENTI: la stessa
   * persona può essere consumer e payer con proporzioni diverse.
   *
   * Per ogni settlement confermato:
   *   from → balance += amount  (ha rimborsato, chiude un debito)
   *   to   → balance -= amount  (ha ricevuto, chiude un credito)
   *
   * @param {object}   trip
   * @param {object[]} [expenses]    — default: State.expenses
   * @param {object[]} [settlements] — default: State.settlements
   * @returns {Array<{participant, balance}>}
   */
  balances(trip, expenses, settlements) {
    const exps = expenses    ?? this.expenses;
    const sets = settlements ?? this.settlements;

    // Inizializza tutti i partecipanti a 0
    const map = {};
    trip.participants.forEach(p => { map[p.id] = 0; });

    // ─────────────────────────────────────────────
    // PHASE 1 — Expense ledger (double-entry)
    // ─────────────────────────────────────────────
    for (const e of exps) {
      if (!isGroupExpense(e)) continue;

      const amount = readAmount(e);
      if (amount <= 0) continue;

      // — DEBIT ai consumers —
      const consumers = readConsumers(e);
      const totalCS   = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
      if (totalCS > 0) {
        const unit = amount / totalCS;
        for (const c of consumers) {
          map[c.participantId] = (map[c.participantId] ?? 0) - (c.shares ?? 0) * unit;
        }
      }

      // — CREDIT ai payers —
      const payers  = readPayers(e);
      const totalPS = payers.reduce((s, p) => s + (p.sharesPaid ?? 0), 0);
      if (totalPS > 0) {
        const unit = amount / totalPS;
        for (const p of payers) {
          map[p.participantId] = (map[p.participantId] ?? 0) + (p.sharesPaid ?? 0) * unit;
        }
      }
    }

    // ─────────────────────────────────────────────
    // PHASE 2 — Settlements (movimenti reali)
    //
    //   from → ha pagato il debito  (+amount)
    //   to   → ha ricevuto          (−amount)
    // ─────────────────────────────────────────────
    for (const s of sets) {
      const amount = readSettlementAmount(s);
      map[s.fromParticipantId] = (map[s.fromParticipantId] ?? 0) + amount;
      map[s.toParticipantId]   = (map[s.toParticipantId]   ?? 0) - amount;
    }

    // ─────────────────────────────────────────────
    // OUTPUT — arrotondamento a centesimo intero
    // ─────────────────────────────────────────────
    return trip.participants.map(p => ({
      participant: p,
      balance: Math.round(map[p.id] ?? 0),
    }));
  },

  // ─────────────────────────────────────────────────────
  // SUGGESTED SETTLEMENTS (pure greedy matching)
  // ─────────────────────────────────────────────────────

  suggestedSettlements(trip, expenses, settlements) {
    const bal = this.balances(trip, expenses, settlements);

    const credits = bal
      .filter(b => b.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const debts = bal
      .filter(b => b.balance < 0)
      .sort((a, b) => a.balance - b.balance);

    const txs = [];
    let i = 0, j = 0;

    while (i < credits.length && j < debts.length) {
      const credit = credits[i];
      const debt   = debts[j];
      const amount = Math.min(credit.balance, Math.abs(debt.balance));

      txs.push({
        from:        debt.participant,
        to:          credit.participant,
        amountCents: Math.round(amount),
      });

      credit.balance -= amount;
      debt.balance   += amount;

      if (credit.balance <= 0) i++;
      if (debt.balance   >= 0) j++;
    }

    return txs;
  },
};
