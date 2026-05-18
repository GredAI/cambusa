/* =====================================================
   CAMBUSA — domain/balances.test.js  (Ledger V3)
   Test unitari per balance engine e suggestedSettlements.

   COME ESEGUIRE
   ─────────────────────────────────────────────────────
   Nella console del browser:
     import('/cambusa/js/domain/balances.test.js')
   ===================================================== */

import { State } from '../state.js';

// ── Helpers V3 ────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2);

const mkP = (id, name) => ({ id, name, color: '#888', startDate: null, endDate: null });
const mkTrip = (...ps) => ({ id: 't1', participants: ps, currency: '€', groups: [] });

function mkExp({ amount, consumers, payers, splitMeta = null, deletedAt = null }) {
  return {
    id: uid(), tripId: 't1', title: 'test', category: 'altro',
    amountCents: amount, currency: '€', date: '2026-01-01', notes: '',
    consumers, payers, splitMeta, deletedAt,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function balMap(trip, expenses, settlements = []) {
  const r = {};
  State.balances(trip, expenses, settlements).forEach(b => { r[b.participant.id] = b.balance; });
  return r;
}

// ── Framework ─────────────────────────────────────────
let _p = 0, _f = 0;
function test(label, fn) {
  try { fn(); console.log(`✓  ${label}`); _p++; }
  catch (e) { console.error(`✗  ${label}\n   ${e.message}`); _f++; }
}
const eq  = (a, b, m) => { if (a !== b) throw new Error(`${m ?? ''}\n   expected ${b}, got ${a}`); };
const ok  = (c, m)    => { if (!c) throw new Error(m ?? 'assertion failed'); };
const sum0 = m => { const s = Object.values(m).reduce((a,b)=>a+b,0); if(Math.abs(s)>1) throw new Error(`sum non-zero: ${s}`); };

// ════════════════════════════════════════════════════
// SUITE 1 — Balance engine base
// ════════════════════════════════════════════════════

test('split uguale 2 persone', () => {
  const t = mkTrip(mkP('a','Alice'), mkP('b','Bob'));
  const m = balMap(t, [mkExp({
    amount: 1000,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1}],
    payers:    [{participantId:'a',sharesPaid:1000}],
  })]);
  eq(m.a,  500); eq(m.b, -500); sum0(m);
});

test('split uguale 3 persone — rounding ok', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('c','C'));
  const m = balMap(t, [mkExp({
    amount: 1000,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'c',shares:1}],
    payers:    [{participantId:'a',sharesPaid:1000}],
  })]);
  sum0(m); ok(m.a > 0); ok(m.b < 0); ok(m.c < 0);
});

test('quote asimmetriche 1:2', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const m = balMap(t, [mkExp({
    amount: 9000,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:2}],
    payers:    [{participantId:'a',sharesPaid:9000}],
  })]);
  eq(m.a, 6000); eq(m.b, -6000); sum0(m);
});

test('multi-payer: due pagatori', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('c','C'));
  const m = balMap(t, [mkExp({
    amount: 1500,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'c',shares:1}],
    payers:    [{participantId:'a',sharesPaid:1000},{participantId:'b',sharesPaid:500}],
  })]);
  eq(m.a, 500); eq(m.b, 0); eq(m.c, -500); sum0(m);
});

test('multiple spese cumulative', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const m = balMap(t, [
    mkExp({ amount:2000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'a',sharesPaid:2000}] }),
    mkExp({ amount:4000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'b',sharesPaid:4000}] }),
  ]);
  eq(m.a, -1000); eq(m.b, 1000); sum0(m);
});

// ════════════════════════════════════════════════════
// SUITE 2 — Soft delete
// ════════════════════════════════════════════════════

test('spesa deletedAt → esclusa', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const m = balMap(t, [mkExp({
    amount: 1000,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1}],
    payers:    [{participantId:'a',sharesPaid:1000}],
    deletedAt: '2026-01-02T00:00:00.000Z',
  })]);
  eq(m.a, 0); eq(m.b, 0);
});

// ════════════════════════════════════════════════════
// SUITE 3 — Modalità guests
// ════════════════════════════════════════════════════

test('guest mode: ospite non payer → ha debit', () => {
  // A paga tutto (200), A e G consumano (100 each). G ha debit -100, A ha credit +100.
  const t = mkTrip(mkP('a','A'), mkP('g','Ospite'));
  const m = balMap(t, [mkExp({
    amount: 200,
    consumers: [{participantId:'a',shares:1},{participantId:'g',shares:1}],
    payers:    [{participantId:'a',sharesPaid:200}],
  })]);
  eq(m.a,  100); eq(m.g, -100); sum0(m);
});

test('guest mode: quote teoriche sommano a total', () => {
  // A(200) + B(100) = 300 = amount → unit = 1 → crediti esatti
  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('g','G'));
  const m = balMap(t, [mkExp({
    amount: 300,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'g',shares:1}],
    payers:    [{participantId:'a',sharesPaid:200},{participantId:'b',sharesPaid:100}],
    splitMeta: { payerMode:'guests', guests:[{guestId:'g',payerIds:['a']}] },
  })]);
  eq(m.a, 100); eq(m.b, 0); eq(m.g, -100); sum0(m);
});

// ════════════════════════════════════════════════════
// SUITE 4 — Settlements
// ════════════════════════════════════════════════════

test('settlement parziale riduce debito', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const m = balMap(t,
    [mkExp({ amount:2000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'a',sharesPaid:2000}] })],
    [{ id:'s1', tripId:'t1', fromParticipantId:'b', toParticipantId:'a', amountCents:500 }]
  );
  eq(m.a, 500); eq(m.b, -500); sum0(m);
});

test('settlement totale → balance zero', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const m = balMap(t,
    [mkExp({ amount:2000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'a',sharesPaid:2000}] })],
    [{ id:'s1', tripId:'t1', fromParticipantId:'b', toParticipantId:'a', amountCents:1000 }]
  );
  eq(m.a, 0); eq(m.b, 0);
});

// ════════════════════════════════════════════════════
// SUITE 5 — suggestedSettlements
// ════════════════════════════════════════════════════

test('greedy: minimizza transazioni 3 persone', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('c','C'));
  const txs = State.suggestedSettlements(t, [mkExp({
    amount: 3000,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'c',shares:1}],
    payers:    [{participantId:'a',sharesPaid:3000}],
  })], []);
  eq(txs.length, 2);
  eq(txs.reduce((s,tx)=>s+tx.amountCents,0), 2000);
});

test('nessuna transazione se tutti in pari', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'));
  const txs = State.suggestedSettlements(t, [
    mkExp({ amount:2000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'a',sharesPaid:2000}] }),
    mkExp({ amount:2000, consumers:[{participantId:'a',shares:1},{participantId:'b',shares:1}], payers:[{participantId:'b',sharesPaid:2000}] }),
  ], []);
  eq(txs.length, 0);
});

test('guests: ospite paga il suo pagante designato', () => {
  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('g','Ospite'));
  const txs = State.suggestedSettlements(t, [mkExp({
    amount: 300,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'g',shares:1}],
    payers:    [{participantId:'a',sharesPaid:200},{participantId:'b',sharesPaid:100}],
    splitMeta: { payerMode:'guests', guests:[{guestId:'g',payerIds:['a']}] },
  })], []);
  const gToA = txs.find(tx => tx.from.id === 'g' && tx.to.id === 'a');
  ok(gToA, 'G deve pagare A');
  eq(gToA.amountCents, 100);
});

// ════════════════════════════════════════════════════
// SUITE 6 — suggestedSettlements: routing ospiti
// ════════════════════════════════════════════════════

test('guest routing: ospite paga host anche se host è debitore netto', () => {
  // Scenario che triggera il bug storico:
  //   Cena (300): A B G consumano (100 each), A paga tutto.
  //   G è ospite di A (payerId=A).
  //   Altra spesa (250): B paga tutto per A e B.
  //   A ha anche un debito → saldo netto A potrebbe essere < 0.
  //
  //   ATTESO: G paga sempre A (il suo host), non B.

  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('g','G'));

  const dinner = mkExp({
    amount: 300,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1},{participantId:'g',shares:1}],
    payers:    [{participantId:'a',sharesPaid:300}],
    splitMeta: { payerMode:'guests', guests:[{guestId:'g',payerIds:['a']}] },
  });

  // Spesa aggiuntiva: B paga €250 per A e B → A deve €125 a B
  const extra = mkExp({
    amount: 250,
    consumers: [{participantId:'a',shares:1},{participantId:'b',shares:1}],
    payers:    [{participantId:'b',sharesPaid:250}],
  });

  const m = balMap(t, [dinner, extra]);
  // Verifica saldi: A = +200 (dinner) - 125 (extra) = +75
  //                 B = -100 (dinner) + 125 (extra) = +25
  //                 G = -100
  sum0(m);

  const txs = State.suggestedSettlements(t, [dinner, extra], []);
  const gToA = txs.find(tx => tx.from.id === 'g' && tx.to.id === 'a');
  ok(gToA, 'G deve sempre pagare A (il suo host designato), non B');
  eq(gToA.amountCents, 100, 'G deve pagare 100 ad A');
});

test('guest routing: host in debito netto — G comunque paga host', () => {
  // Host A paga cena per G (G owes 50 to A).
  // Ma A ha un debito GRANDE da altra spesa → A saldo netto = negativo.
  // BUG precedente: Phase 1 skippava, G finiva a pagare il terzo C.
  // ATTESO: G paga A.

  const t = mkTrip(mkP('a','A'), mkP('b','B'), mkP('c','C'), mkP('g','G'));

  const dinner = mkExp({
    amount: 100,
    consumers: [{participantId:'a',shares:1},{participantId:'g',shares:1}],
    payers:    [{participantId:'a',sharesPaid:100}],
    splitMeta: { payerMode:'guests', guests:[{guestId:'g',payerIds:['a']}] },
  });

  // Grande spesa: C paga €500, A e C sono consumer → A deve €250 a C
  const bigExp = mkExp({
    amount: 500,
    consumers: [{participantId:'a',shares:1},{participantId:'c',shares:1}],
    payers:    [{participantId:'c',sharesPaid:500}],
  });

  // Saldo A: +50 (dinner credit) - 250 (bigExp debit) = -200 → A è debitore netto
  const m = balMap(t, [dinner, bigExp]);
  ok(m.a < 0, 'A deve essere debitore netto per questo test');

  const txs = State.suggestedSettlements(t, [dinner, bigExp], []);
  const gToA = txs.find(tx => tx.from.id === 'g' && tx.to.id === 'a');
  ok(gToA, 'G deve pagare A (host designato) anche se A è debitore netto');
  eq(gToA.amountCents, 50, 'G deve pagare 50 ad A');

  // La somma totale di tutti i pagamenti deve essere corretta
  const totalTxs = txs.reduce((s, tx) => s + tx.amountCents, 0);
  // G(-50) + A(-200) + B(0) + C(+250) → devono pagarsi 250 totali
  eq(totalTxs, 250);
});

// ── Risultato ─────────────────────────────────────────
console.log(`\n────────────────────────────────────────────`);
console.log(`Cambusa V3 tests: ${_p}/${_p+_f} passati${_f ? ` — ${_f} FALLITI` : ' ✓'}`);
