/* =====================================================
   CAMBUSA — domain/guards.js  (Ledger V3)
   Predicati e helper di dominio centralizzati.

   V3: ogni spesa ha consumers[] + payers[].
   Nessun campo globale su Participant (no shares, no delega).
   ===================================================== */

// ── Amount — lettura canonical ────────────────────────
/**
 * Legge l'importo di un record in centesimi interi.
 * @param {object} record — expense o settlement
 * @returns {number} centesimi interi
 */
export function readAmount(record) {
  if (!record) return 0;
  if (Number.isInteger(record.amountCents)) return record.amountCents;
  console.warn('[readAmount] amountCents assente su record', record.id ?? '(no id)');
  return 0;
}

// ── Expense predicati ────────────────────────────────

/** Spesa attiva (non eliminata) — entra nel calcolo saldi */
export function isGroupExpense(e) {
  return !!e && !e.deletedAt;
}

/** Spesa eliminata (soft delete) */
export function isDeletedExpense(e) {
  return !!e && !!e.deletedAt;
}

/** Spesa attiva (non eliminata) */
export function isActiveExpense(e) {
  return !!e && !e.deletedAt;
}

// ── Consumer / Payer accessors ────────────────────────

/**
 * Restituisce i consumers di una spesa.
 * Consumer = chi beneficia economicamente della spesa.
 * @param {object} expense
 * @returns {Array<{participantId, shares}>}
 */
export function readConsumers(expense) {
  return expense?.consumers ?? [];
}

/**
 * Restituisce i payers di una spesa.
 * Payer = chi ha anticipato il denaro.
 * @param {object} expense
 * @returns {Array<{participantId, sharesPaid}>}
 */
export function readPayers(expense) {
  return expense?.payers ?? [];
}

/**
 * Somma delle shares consumer — denominatore per il calcolo del debito.
 * @param {object} expense
 * @returns {number}
 */
export function totalConsumerShares(expense) {
  return readConsumers(expense).reduce((s, c) => s + (c.shares ?? 0), 0);
}

/**
 * Somma delle sharesPaid payer — denominatore per il calcolo del credito.
 * @param {object} expense
 * @returns {number}
 */
export function totalPayerShares(expense) {
  return readPayers(expense).reduce((s, p) => s + (p.sharesPaid ?? 0), 0);
}

// ── Settlement helpers ────────────────────────────────

/** Amount settlement in centesimi */
export function readSettlementAmount(settlement) {
  return readAmount(settlement);
}
