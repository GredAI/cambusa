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
  // SUGGESTED SETTLEMENTS
  //
  // Algoritmo in due fasi:
  //   Fase 1 — settlement diretti basati sulle relazioni ospite→pagante
  //             (da splitMeta.guests di ogni spesa in modalità "guests")
  //   Fase 2 — greedy standard sui saldi residui
  //
  // Questo garantisce che gli ospiti saldino con chi ha pagato per loro,
  // non con il creditore maggiore scelto matematicamente.
  // ─────────────────────────────────────────────────────

  suggestedSettlements(trip, expenses, settlements) {
    const exps = expenses ?? this.expenses;
    const bal  = this.balances(trip, exps, settlements);

    // Mappa saldi mutabili per aggiornamento in-place
    const balMap = {};
    bal.forEach(b => { balMap[b.participant.id] = b.balance; });

    const txs = [];

    // ── Fase 1: settlement diretti ospite→pagante ──────
    // Per ogni spesa guests: costruisce le coppie (ospite → suo pagante)
    // proporzionali alla quota consumata e al numero di co-paganti.
    for (const e of exps) {
      if (!e.splitMeta?.guests?.length) continue;

      const consumers = e.consumers ?? [];
      const totalCS   = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
      if (totalCS === 0) continue;

      const amountCents = readAmount(e);

      for (const { guestId, payerIds } of e.splitMeta.guests) {
        if (!payerIds?.length) continue;
        const guestC = consumers.find(c => c.participantId === guestId);
        if (!guestC) continue;

        // Quota dell'ospite divisa equamente tra i co-paganti
        const guestTotal = Math.round(amountCents * (guestC.shares ?? 0) / totalCS);
        const perPayer   = Math.round(guestTotal / payerIds.length);

        for (const payerId of payerIds) {
          const debtorBal   = balMap[guestId]  ?? 0;
          const creditorBal = balMap[payerId]   ?? 0;
          if (debtorBal >= 0 || creditorBal <= 0) continue;

          const amount = Math.min(Math.abs(debtorBal), creditorBal, perPayer);
          if (amount < 1) continue;

          const from = trip.participants.find(p => p.id === guestId);
          const to   = trip.participants.find(p => p.id === payerId);
          if (!from || !to) continue;

          txs.push({ from, to, amountCents: Math.round(amount) });
          balMap[guestId]  = (balMap[guestId]  ?? 0) + amount;
          balMap[payerId]  = (balMap[payerId]   ?? 0) - amount;
        }
      }
    }

    // ── Fase 2: greedy sui saldi residui ──────────────
    const credits = Object.entries(balMap)
      .filter(([, b]) => b > 0)
      .map(([id, balance]) => ({
        participant: trip.participants.find(p => p.id === id),
        balance,
      }))
      .filter(x => x.participant)
      .sort((a, b) => b.balance - a.balance);

    const debts = Object.entries(balMap)
      .filter(([, b]) => b < 0)
      .map(([id, balance]) => ({
        participant: trip.participants.find(p => p.id === id),
        balance,
      }))
      .filter(x => x.participant)
      .sort((a, b) => a.balance - b.balance);

    let i = 0, j = 0;
    while (i < credits.length && j < debts.length) {
      const credit = credits[i];
      const debt   = debts[j];
      if (credit.balance < 1) { i++; continue; }
      if (Math.abs(debt.balance) < 1) { j++; continue; }

      const amount = Math.min(credit.balance, Math.abs(debt.balance));

      txs.push({
        from:        debt.participant,
        to:          credit.participant,
        amountCents: Math.round(amount),
      });

      credit.balance -= amount;
      debt.balance   += amount;

      if (credit.balance < 1) i++;
      if (debt.balance  > -1) j++;
    }

    return txs;
  },
};
