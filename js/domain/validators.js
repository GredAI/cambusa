/* =====================================================
   CAMBUSA — domain/validators.js  (Ledger V3)
   Validazione centralizzata delle entità di dominio.

   V3: validateExpense verifica consumers[] e payers[].
   INVARIANTI:
     1. totalConsumerShares > 0
     2. totalPayerShares > 0
     3. (Ledger chiuso — garantito dalla matematica, non validato qui)
   ===================================================== */

// ── Costanti codici errore ────────────────────────────

export const E = {

  // Expense — generali
  EXPENSE_MISSING_TRIP_ID:                'expense_missing_trip_id',
  EXPENSE_INVALID_AMOUNT:                 'expense_invalid_amount',
  EXPENSE_AMOUNT_NOT_POSITIVE:            'expense_amount_not_positive',
  EXPENSE_MISSING_DATE:                   'expense_missing_date',
  EXPENSE_INVALID_DATE:                   'expense_invalid_date',

  // Consumers
  EXPENSE_EMPTY_CONSUMERS:                'expense_empty_consumers',
  EXPENSE_CONSUMERS_ZERO_WEIGHT:          'expense_consumers_zero_weight',
  EXPENSE_CONSUMER_MISSING_PARTICIPANT:   'expense_consumer_missing_participant',
  EXPENSE_CONSUMER_DUPLICATE_PARTICIPANT: 'expense_consumer_duplicate_participant',

  // Payers
  EXPENSE_EMPTY_PAYERS:                   'expense_empty_payers',
  EXPENSE_PAYERS_ZERO_WEIGHT:             'expense_payers_zero_weight',
  EXPENSE_PAYER_MISSING_PARTICIPANT:      'expense_payer_missing_participant',
  EXPENSE_PAYER_DUPLICATE_PARTICIPANT:    'expense_payer_duplicate_participant',

  // Trip
  TRIP_MISSING_NAME:                      'trip_missing_name',
  TRIP_MISSING_START_DATE:                'trip_missing_start_date',
  TRIP_MISSING_END_DATE:                  'trip_missing_end_date',
  TRIP_INVALID_DATE_RANGE:                'trip_invalid_date_range',
  TRIP_MISSING_CURRENCY:                  'trip_missing_currency',

  // Participant
  PARTICIPANT_MISSING_NAME:               'participant_missing_name',

  // Settlement
  SETTLEMENT_MISSING_TRIP_ID:             'settlement_missing_trip_id',
  SETTLEMENT_MISSING_FROM:                'settlement_missing_from',
  SETTLEMENT_MISSING_TO:                  'settlement_missing_to',
  SETTLEMENT_SAME_PARTICIPANT:            'settlement_same_participant',
  SETTLEMENT_INVALID_AMOUNT:              'settlement_invalid_amount',
  SETTLEMENT_AMOUNT_NOT_POSITIVE:         'settlement_amount_not_positive',
};

// ── Tipi di risultato ─────────────────────────────────

const OK = Object.freeze({ valid: true, errors: [] });

function fail(...codes) {
  return { valid: false, errors: codes };
}

function collect(checks) {
  const errors = checks.filter(Boolean);
  return errors.length === 0 ? OK : { valid: false, errors };
}

// ── Helpers ───────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateStr(s) {
  if (!s || !ISO_DATE_RE.test(s)) return false;
  return !isNaN(new Date(s + 'T00:00:00').getTime());
}

// ── validateExpense ───────────────────────────────────

/**
 * Valida una spesa prima del salvataggio.
 * Verifica invarianti: consumers non vuoti, payers non vuoti, pesi > 0.
 *
 * @param {object} expense
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExpense(expense) {
  if (!expense) return fail(E.EXPENSE_MISSING_TRIP_ID);

  const errors = [];

  // Obbligatori
  if (!expense.tripId)
    errors.push(E.EXPENSE_MISSING_TRIP_ID);

  if (!Number.isInteger(expense.amountCents))
    errors.push(E.EXPENSE_INVALID_AMOUNT);
  else if (expense.amountCents <= 0)
    errors.push(E.EXPENSE_AMOUNT_NOT_POSITIVE);

  if (!expense.date)
    errors.push(E.EXPENSE_MISSING_DATE);
  else if (!isValidDateStr(expense.date))
    errors.push(E.EXPENSE_INVALID_DATE);

  // ── Consumers ──────────────────────────────────────
  const consumers = expense.consumers ?? [];
  if (consumers.length === 0) {
    errors.push(E.EXPENSE_EMPTY_CONSUMERS);
  } else {
    const cPids = consumers.map(c => c.participantId).filter(Boolean);
    if (cPids.length < consumers.length)
      errors.push(E.EXPENSE_CONSUMER_MISSING_PARTICIPANT);
    if (new Set(cPids).size !== cPids.length)
      errors.push(E.EXPENSE_CONSUMER_DUPLICATE_PARTICIPANT);
    const totalCS = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
    if (totalCS === 0)
      errors.push(E.EXPENSE_CONSUMERS_ZERO_WEIGHT);
  }

  // ── Payers ─────────────────────────────────────────
  const payers = expense.payers ?? [];
  if (payers.length === 0) {
    errors.push(E.EXPENSE_EMPTY_PAYERS);
  } else {
    const pPids = payers.map(p => p.participantId).filter(Boolean);
    if (pPids.length < payers.length)
      errors.push(E.EXPENSE_PAYER_MISSING_PARTICIPANT);
    if (new Set(pPids).size !== pPids.length)
      errors.push(E.EXPENSE_PAYER_DUPLICATE_PARTICIPANT);
    const totalPS = payers.reduce((s, p) => s + (p.sharesPaid ?? 0), 0);
    if (totalPS === 0)
      errors.push(E.EXPENSE_PAYERS_ZERO_WEIGHT);
  }

  return errors.length === 0 ? OK : { valid: false, errors };
}

// ── validateTrip ──────────────────────────────────────

export function validateTrip(trip) {
  if (!trip) return fail(E.TRIP_MISSING_NAME);
  return collect([
    (!trip.name || !trip.name.trim())                              && E.TRIP_MISSING_NAME,
    !trip.startDate                                                && E.TRIP_MISSING_START_DATE,
    !trip.endDate                                                  && E.TRIP_MISSING_END_DATE,
    (trip.startDate && trip.endDate && trip.endDate < trip.startDate) && E.TRIP_INVALID_DATE_RANGE,
    (!trip.currency || !trip.currency.trim())                      && E.TRIP_MISSING_CURRENCY,
  ]);
}

// ── validateParticipant ───────────────────────────────

/**
 * V3: participant è solo anagrafica — validazione minima.
 */
export function validateParticipant(participant) {
  if (!participant) return fail(E.PARTICIPANT_MISSING_NAME);
  return collect([
    (!participant.name || !participant.name.trim()) && E.PARTICIPANT_MISSING_NAME,
  ]);
}

// ── validateSettlement ────────────────────────────────

export function validateSettlement(settlement) {
  if (!settlement) return fail(E.SETTLEMENT_MISSING_TRIP_ID);
  return collect([
    !settlement.tripId                                                      && E.SETTLEMENT_MISSING_TRIP_ID,
    !settlement.fromParticipantId                                           && E.SETTLEMENT_MISSING_FROM,
    !settlement.toParticipantId                                             && E.SETTLEMENT_MISSING_TO,
    (settlement.fromParticipantId === settlement.toParticipantId)           && E.SETTLEMENT_SAME_PARTICIPANT,
    !Number.isInteger(settlement.amountCents)                               && E.SETTLEMENT_INVALID_AMOUNT,
    (Number.isInteger(settlement.amountCents) && settlement.amountCents <= 0) && E.SETTLEMENT_AMOUNT_NOT_POSITIVE,
  ]);
}

// ── ValidationError ───────────────────────────────────

export class ValidationError extends Error {
  constructor(errors, entity = 'entity') {
    super(`[Validation] ${entity} non valida: ${errors.join(', ')}`);
    this.name   = 'ValidationError';
    this.errors = errors;
    this.entity = entity;
  }
}

export function assertValid(result, entity) {
  if (!result.valid) throw new ValidationError(result.errors, entity);
}
