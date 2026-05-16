/* =====================================================
   CAMBUSA — domain/balances.test.js
   Test unitari per il balance engine (State.balances)
   e il simplification engine (State.suggestedSettlements).

   COME ESEGUIRE
   ─────────────────────────────────────────────────────
   Apri la console del browser e carica questo file:
     import('/js/domain/balances.test.js')
   Oppure aggiungi temporaneamente in app.js:
     import './domain/balances.test.js';

   OUTPUT
   ─────────────────────────────────────────────────────
   ✓  caso superato
   ✗  caso fallito — mostra expected / actual
   Alla fine: "N/N test passati"
   ===================================================== */

import { readAmount, isGroupExpense } from './guards.js';
import { State } from '../state.js';
import {
  validateExpense, validateTrip, validateParticipant, validateSettlement,
  E, ValidationError, assertValid,
} from './validators.js';

// ── Helpers di costruzione ────────────────────────────

function p(id, name, shares = 1, liabilityOwnerId = null) {
  return { id, name, shares, liabilityOwnerId, color: '#000', startDate: null, endDate: null };
}

function trip(...participants) {
  return { id: 't1', participants };
}

function expense(overrides) {
  return {
    id:                  crypto.randomUUID(),
    tripId:              't1',
    title:               'test',
    category:            'altro',
    amountCents:         0,
    amount:              0,
    currency:            '€',
    paidByParticipantId: null,
    splits:              [],
    splitMode:           'shares',
    date:                '2026-01-01',
    notes:               '',
    personal:            false,
    ownerId:             null,
    deletedAt:           null,
    attachmentIds:       [],
    createdAt:           new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
    ...overrides,
  };
}

function settlement(from, to, amountCents) {
  return {
    id:                crypto.randomUUID(),
    tripId:            't1',
    fromParticipantId: from,
    toParticipantId:   to,
    amountCents,
    amount:            amountCents,
    confirmed:         true,
    createdAt:         new Date().toISOString(),
  };
}

function balanceMap(trip, expenses, settlements = []) {
  const result = {};
  State.balances(trip, expenses, settlements).forEach(b => {
    result[b.participant.id] = b.balance;
  });
  return result;
}

// ── Framework minimale ────────────────────────────────

let _passed = 0;
let _failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`✓  ${label}`);
    _passed++;
  } catch (err) {
    console.error(`✗  ${label}\n   ${err.message}`);
    _failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg ?? ''}\n   expected: ${expected}\n   actual:   ${actual}`);
  }
}

function assertSumZero(map) {
  const sum = Object.values(map).reduce((s, v) => s + v, 0);
  if (Math.abs(sum) > 1) {
    throw new Error(`balance sum non-zero: ${sum} cents`);
  }
}

// ════════════════════════════════════════════════════
// SUITE 1 — Balance engine base
// ════════════════════════════════════════════════════

test('split uguale 2 persone — balance somma a zero', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 1000,  // €10.00
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const m = balanceMap(t, exps);
  assertEqual(m['a'],  500, 'Alice deve avere +500');
  assertEqual(m['b'], -500, 'Bob deve avere -500');
  assertSumZero(m);
});

test('split uguale 3 persone — rounding corretto', () => {
  // 1000 / 3 = 333.33... → i centesimi non tornano interi
  // il sistema deve gestirlo senza perdere 1 cent
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const c = p('c', 'Carlo');
  const t = trip(a, b, c);
  const exps = [
    expense({
      amountCents: 1000,
      paidByParticipantId: 'a',
      splits: [
        { participantId: 'a', shares: 1 },
        { participantId: 'b', shares: 1 },
        { participantId: 'c', shares: 1 },
      ],
    }),
  ];
  const m = balanceMap(t, exps);
  assertSumZero(m);
  assert(m['a'] > 0, 'Alice deve essere in credito');
  assert(m['b'] < 0, 'Bob deve essere in debito');
  assert(m['c'] < 0, 'Carlo deve essere in debito');
});

test('payer incluso nella divisione — non si paga da solo', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 3000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const m = balanceMap(t, exps);
  // Alice ha pagato 3000, deve 1500 → netto +1500
  assertEqual(m['a'],  1500);
  assertEqual(m['b'], -1500);
});

test('payer NON incluso nella divisione — netto pieno', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 3000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'b', shares: 1 }],  // solo Bob
    }),
  ];
  const m = balanceMap(t, exps);
  // Alice ha pagato tutto per Bob → credito pieno +3000
  assertEqual(m['a'],  3000);
  assertEqual(m['b'], -3000);
});

test('quote asimmetriche — shares 1:2', () => {
  const a = p('a', 'Alice', 1);
  const b = p('b', 'Bob',   2);
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 9000,  // €90 — divisibile per 3
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 2 }],
    }),
  ];
  const m = balanceMap(t, exps);
  // Alice paga 9000, deve 3000 → +6000
  // Bob deve 6000 → -6000
  assertEqual(m['a'],  6000);
  assertEqual(m['b'], -6000);
  assertSumZero(m);
});

test('multiple spese — balance cumulativi', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
    expense({
      amountCents: 4000,
      paidByParticipantId: 'b',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const m = balanceMap(t, exps);
  // Alice: pagato 2000, deve 3000 → -1000
  // Bob: pagato 4000, deve 3000 → +1000
  assertEqual(m['a'], -1000);
  assertEqual(m['b'],  1000);
  assertSumZero(m);
});

test('zero debt — tutti pari', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
    expense({
      amountCents: 2000,
      paidByParticipantId: 'b',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const m = balanceMap(t, exps);
  assertEqual(m['a'], 0);
  assertEqual(m['b'], 0);
});

// ════════════════════════════════════════════════════
// SUITE 2 — Soft delete
// ════════════════════════════════════════════════════

test('spesa eliminata (deletedAt) — esclusa dai saldi', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 1000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
      deletedAt: '2026-01-02T10:00:00.000Z',  // eliminata
    }),
  ];
  const m = balanceMap(t, exps);
  assertEqual(m['a'], 0, 'spesa deleted non deve influire');
  assertEqual(m['b'], 0, 'spesa deleted non deve influire');
});

test('spesa personale — esclusa dai saldi di gruppo', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 5000,
      personal:    true,
      ownerId:     'a',
      paidByParticipantId: 'a',
      splits:      [],
    }),
  ];
  const m = balanceMap(t, exps);
  assertEqual(m['a'], 0, 'spesa personal non deve influire sui saldi di gruppo');
  assertEqual(m['b'], 0);
});

// ════════════════════════════════════════════════════
// SUITE 3 — Ospiti e deleghe
// ════════════════════════════════════════════════════

test('ospite (shares=0) — non entra nel split', () => {
  const a = p('a', 'Alice', 1);
  const b = p('b', 'Bob',   1);
  const c = p('c', 'Ospite', 0);  // ospite
  const t = trip(a, b, c);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [
        { participantId: 'a', shares: 1 },
        { participantId: 'b', shares: 1 },
        { participantId: 'c', shares: 0 },  // ospite: 0 quote
      ],
    }),
  ];
  const m = balanceMap(t, exps);
  assertEqual(m['a'],  1000);
  assertEqual(m['b'], -1000);
  assertEqual(m['c'],  0, "l'ospite non deve avere debiti");
  assertSumZero(m);
});

test('liability absorption — il debito va al liability owner', () => {
  const a = p('a', 'Alice', 1);
  const b = p('b', 'Bob',   1);
  const c = p('c', 'Carlo', 1, 'b');  // Carlo: liabilityOwnerId = Bob
  const t = trip(a, b, c);
  const exps = [
    expense({
      amountCents: 3000,
      paidByParticipantId: 'a',
      splits: [
        { participantId: 'a', shares: 1 },
        { participantId: 'b', shares: 1 },
        { participantId: 'c', shares: 1 },  // debito di Carlo → va a Bob
      ],
    }),
  ];
  const m = balanceMap(t, exps);
  // Alice: pagato 3000, deve 1000 → +2000
  // Bob: deve 1000 proprie + 1000 di Carlo → -2000
  // Carlo: delegato, balance 0
  assertEqual(m['a'],  2000, 'Alice: credito netto');
  assertEqual(m['b'], -2000, 'Bob: copre anche la quota di Carlo');
  assertEqual(m['c'],  0,    'Carlo: zero perché ha delegato');
  assertSumZero(m);
});

// ════════════════════════════════════════════════════
// SUITE 4 — Settlements
// ════════════════════════════════════════════════════

test('settlement confirma un pagamento — riduce il debito', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const sets = [
    settlement('b', 'a', 500),  // Bob ha già pagato 500 ad Alice
  ];
  const m = balanceMap(t, exps, sets);
  assertEqual(m['a'],  500, 'Alice: credito ridotto del pagamento ricevuto');
  assertEqual(m['b'], -500, 'Bob: debito ridotto del pagamento già fatto');
  assertSumZero(m);
});

test('settlement totale — balance a zero', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const sets = [
    settlement('b', 'a', 1000),  // Bob ha saldato tutto
  ];
  const m = balanceMap(t, exps, sets);
  assertEqual(m['a'], 0);
  assertEqual(m['b'], 0);
});

// ════════════════════════════════════════════════════
// SUITE 5 — Guards
// ════════════════════════════════════════════════════

test('readAmount — legge amountCents se presente', () => {
  const e = expense({ amountCents: 1500, amount: 999 });
  assertEqual(readAmount(e), 1500, 'deve preferire amountCents');
});

test('readAmount — fallback su amount se amountCents mancante', () => {
  const e = { amount: 2000 };  // legacy record senza amountCents
  assertEqual(readAmount(e), 2000, 'deve leggere amount come fallback');
});

test('readAmount — fallback 0 se record null', () => {
  assertEqual(readAmount(null), 0);
  assertEqual(readAmount(undefined), 0);
});

test('isGroupExpense — esclude personal', () => {
  assert(!isGroupExpense(expense({ personal: true })), 'personal non è di gruppo');
  assert( isGroupExpense(expense({ personal: false })), 'non-personal è di gruppo');
});

test('isGroupExpense — esclude deleted', () => {
  assert(!isGroupExpense(expense({ deletedAt: '2026-01-01T00:00:00.000Z' })), 'deleted non è di gruppo');
  assert( isGroupExpense(expense({ deletedAt: null })), 'non-deleted è di gruppo');
});

// ════════════════════════════════════════════════════
// SUITE 6 — suggestedSettlements
// ════════════════════════════════════════════════════

test('suggestedSettlements — minimizza transazioni 3 persone', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const c = p('c', 'Carlo');
  const t = trip(a, b, c);
  // Alice paga tutto, Bob e Carlo devono ciascuno 1000
  const exps = [
    expense({
      amountCents: 3000,
      paidByParticipantId: 'a',
      splits: [
        { participantId: 'a', shares: 1 },
        { participantId: 'b', shares: 1 },
        { participantId: 'c', shares: 1 },
      ],
    }),
  ];
  const txs = State.suggestedSettlements(t, exps, []);
  assertEqual(txs.length, 2, 'devono esserci 2 transazioni');
  const totalPaid = txs.reduce((s, tx) => s + tx.amountCents, 0);
  assertEqual(totalPaid, 2000, 'il totale da pagare deve essere 2000 cents');
});

test('suggestedSettlements — nessuna transazione se balance zero', () => {
  const a = p('a', 'Alice');
  const b = p('b', 'Bob');
  const t = trip(a, b);
  const exps = [
    expense({
      amountCents: 2000,
      paidByParticipantId: 'a',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
    expense({
      amountCents: 2000,
      paidByParticipantId: 'b',
      splits: [{ participantId: 'a', shares: 1 }, { participantId: 'b', shares: 1 }],
    }),
  ];
  const txs = State.suggestedSettlements(t, exps, []);
  assertEqual(txs.length, 0, 'nessuna transazione necessaria');
});

// ════════════════════════════════════════════════════
// SUITE 7 — Validators
// ════════════════════════════════════════════════════

// ── validateExpense ───────────────────────────────────

test('validateExpense — spesa valida → valid:true', () => {
  const result = validateExpense(expense({
    amountCents: 1000,
    paidByParticipantId: 'a',
    splits: [{ participantId: 'a', shares: 1 }],
  }));
  assert(result.valid, `atteso valid, errori: ${result.errors?.join(', ')}`);
});

test('validateExpense — amountCents mancante → invalid_amount', () => {
  const e = expense({ amountCents: undefined });
  delete e.amountCents;
  const result = validateExpense(e);
  assert(!result.valid, 'deve fallire senza amountCents');
  assert(result.errors.includes(E.EXPENSE_INVALID_AMOUNT), 'deve avere EXPENSE_INVALID_AMOUNT');
});

test('validateExpense — amountCents zero → amount_not_positive', () => {
  const result = validateExpense(expense({ amountCents: 0 }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_AMOUNT_NOT_POSITIVE));
});

test('validateExpense — amountCents negativo → amount_not_positive', () => {
  const result = validateExpense(expense({ amountCents: -100 }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_AMOUNT_NOT_POSITIVE));
});

test('validateExpense — amountCents float → invalid_amount', () => {
  const result = validateExpense(expense({ amountCents: 10.5 }));
  assert(!result.valid, 'float non è intero');
  assert(result.errors.includes(E.EXPENSE_INVALID_AMOUNT));
});

test('validateExpense — paidBy mancante → missing_payer', () => {
  const result = validateExpense(expense({
    amountCents: 1000,
    paidByParticipantId: null,
    splits: [{ participantId: 'a', shares: 1 }],
  }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_MISSING_PAYER));
});

test('validateExpense — splits vuoti → empty_splits', () => {
  const result = validateExpense(expense({
    amountCents: 1000,
    paidByParticipantId: 'a',
    splits: [],
  }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_EMPTY_SPLITS));
});

test('validateExpense — splits con peso totale 0 → splits_zero_weight', () => {
  const result = validateExpense(expense({
    amountCents: 1000,
    paidByParticipantId: 'a',
    splits: [{ participantId: 'a', shares: 0 }, { participantId: 'b', shares: 0 }],
  }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_SPLITS_ZERO_WEIGHT));
});

test('validateExpense — spesa personale senza splits → valid', () => {
  const result = validateExpense(expense({
    amountCents: 500,
    personal: true,
    paidByParticipantId: null,
    splits: [],
  }));
  assert(result.valid, `spesa personale senza splits deve essere valida: ${result.errors?.join(', ')}`);
});

test('validateExpense — data non ISO → invalid_date', () => {
  const result = validateExpense(expense({
    amountCents: 1000,
    paidByParticipantId: 'a',
    splits: [{ participantId: 'a', shares: 1 }],
    date: 'non-una-data',
  }));
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_INVALID_DATE));
});

test('validateExpense — tripId mancante → missing_trip_id', () => {
  const e = expense({ amountCents: 1000, paidByParticipantId: 'a', splits: [{ participantId: 'a', shares: 1 }] });
  delete e.tripId;
  const result = validateExpense(e);
  assert(!result.valid);
  assert(result.errors.includes(E.EXPENSE_MISSING_TRIP_ID));
});

// ── validateTrip ──────────────────────────────────────

test('validateTrip — trip valido → valid:true', () => {
  const result = validateTrip({
    name: 'Grecia 2026', startDate: '2026-08-10',
    endDate: '2026-08-20', currency: '€',
  });
  assert(result.valid);
});

test('validateTrip — nome vuoto → missing_name', () => {
  const result = validateTrip({ name: '', startDate: '2026-01-01', endDate: '2026-01-10', currency: '€' });
  assert(!result.valid);
  assert(result.errors.includes(E.TRIP_MISSING_NAME));
});

test('validateTrip — date invertite → invalid_date_range', () => {
  const result = validateTrip({ name: 'Test', startDate: '2026-08-20', endDate: '2026-08-10', currency: '€' });
  assert(!result.valid);
  assert(result.errors.includes(E.TRIP_INVALID_DATE_RANGE));
});

// ── validateParticipant ───────────────────────────────

test('validateParticipant — partecipante valido → valid:true', () => {
  const result = validateParticipant({ name: 'Alice', shares: 1 });
  assert(result.valid);
});

test('validateParticipant — nome vuoto → missing_name', () => {
  const result = validateParticipant({ name: '', shares: 1 });
  assert(!result.valid);
  assert(result.errors.includes(E.PARTICIPANT_MISSING_NAME));
});

test('validateParticipant — shares negativo → invalid_shares', () => {
  const result = validateParticipant({ name: 'Alice', shares: -1 });
  assert(!result.valid);
  assert(result.errors.includes(E.PARTICIPANT_INVALID_SHARES));
});

test('validateParticipant — shares=0 (ospite) → valid:true', () => {
  const result = validateParticipant({ name: 'Ospite', shares: 0 });
  assert(result.valid, 'shares=0 è un ospite legittimo');
});

// ── validateSettlement ────────────────────────────────

test('validateSettlement — settlement valido → valid:true', () => {
  const result = validateSettlement({
    tripId: 't1', fromParticipantId: 'a', toParticipantId: 'b', amountCents: 500,
  });
  assert(result.valid);
});

test('validateSettlement — from === to → same_participant', () => {
  const result = validateSettlement({
    tripId: 't1', fromParticipantId: 'a', toParticipantId: 'a', amountCents: 500,
  });
  assert(!result.valid);
  assert(result.errors.includes(E.SETTLEMENT_SAME_PARTICIPANT));
});

test('validateSettlement — amountCents zero → amount_not_positive', () => {
  const result = validateSettlement({
    tripId: 't1', fromParticipantId: 'a', toParticipantId: 'b', amountCents: 0,
  });
  assert(!result.valid);
  assert(result.errors.includes(E.SETTLEMENT_AMOUNT_NOT_POSITIVE));
});

// ── assertValid / ValidationError ─────────────────────

test('assertValid — lancia ValidationError su result invalid', () => {
  let threw = false;
  try {
    assertValid({ valid: false, errors: [E.EXPENSE_MISSING_TRIP_ID] }, 'expense');
  } catch (err) {
    threw = true;
    assert(err instanceof ValidationError, 'deve essere ValidationError');
    assert(err.errors.includes(E.EXPENSE_MISSING_TRIP_ID), 'deve portare i codici errore');
  }
  assert(threw, 'assertValid deve lanciare su result invalid');
});

test('assertValid — non lancia su result valid', () => {
  let threw = false;
  try { assertValid({ valid: true, errors: [] }, 'expense'); }
  catch (_) { threw = true; }
  assert(!threw, 'assertValid non deve lanciare su result valid');
});

// ════════════════════════════════════════════════════
// RISULTATO
// ════════════════════════════════════════════════════

console.log(`\n─────────────────────────────────────────`);
console.log(`Balance engine + Validators: ${_passed}/${_passed + _failed} test passati`);
if (_failed > 0) {
  console.warn(`${_failed} test FALLITI — controlla il balance engine`);
} else {
  console.log('Tutti i test passati ✓');
}
