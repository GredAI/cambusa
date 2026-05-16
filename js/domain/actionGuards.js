/* =====================================================
   CAMBUSA — domain/actionGuards.js
   Guard di operazione: "questa operazione è consentita?"

   DIFFERENZA CON validators.js
   ─────────────────────────────────────────────────────
   validator = "questo oggetto è valido?"     → { valid, errors }
   guard     = "questa operazione è consentita?" → Result Ok|Err

   I guard ricevono entità già caricate (mai IDs raw):
   le Actions fanno il lookup su State/DB e poi passano
   l'oggetto trovato (o null) alla guard function.

   COSTANTI G.*
   ─────────────────────────────────────────────────────
   Prefisso diverso da E.* per distinguere errori di
   operazione (guard) da errori di struttura (validator).
   ===================================================== */

import { Ok, Err } from './result.js';

// ── Costanti codici errore guard ─────────────────────

export const G = {
  TRIP_NOT_FOUND:        'trip_not_found',
  PARTICIPANT_NOT_FOUND: 'participant_not_found',
  EXPENSE_NOT_FOUND:     'expense_not_found',
  EXPENSE_DELETED:       'expense_deleted',
  SETTLEMENT_NOT_FOUND:  'settlement_not_found',
};

// ── Guard functions ───────────────────────────────────

/**
 * Verifica che il trip esista.
 * Riceve il risultato del lookup (oggetto o null), non l'ID.
 *
 * @param {object|null} trip
 * @returns {import('./result.js').Result<object>}
 */
export function checkTripExists(trip) {
  return trip ? Ok(trip) : Err([G.TRIP_NOT_FOUND]);
}

/**
 * Verifica che il partecipante esista nel trip.
 *
 * @param {object|null} participant
 * @returns {import('./result.js').Result<object>}
 */
export function checkParticipantExists(participant) {
  return participant ? Ok(participant) : Err([G.PARTICIPANT_NOT_FOUND]);
}

/**
 * Verifica che la spesa esista.
 *
 * @param {object|null} expense
 * @returns {import('./result.js').Result<object>}
 */
export function checkExpenseExists(expense) {
  return expense ? Ok(expense) : Err([G.EXPENSE_NOT_FOUND]);
}

/**
 * Verifica che la spesa esista e non sia stata soft-deleted.
 * Combina checkExpenseExists + controllo deletedAt.
 *
 * @param {object|null} expense
 * @returns {import('./result.js').Result<object>}
 */
export function checkExpenseNotDeleted(expense) {
  if (!expense)          return Err([G.EXPENSE_NOT_FOUND]);
  if (expense.deletedAt) return Err([G.EXPENSE_DELETED]);
  return Ok(expense);
}

/**
 * Verifica che il settlement esista.
 *
 * @param {object|null} settlement
 * @returns {import('./result.js').Result<object>}
 */
export function checkSettlementExists(settlement) {
  return settlement ? Ok(settlement) : Err([G.SETTLEMENT_NOT_FOUND]);
}
