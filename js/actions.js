/* =====================================================
   CAMBUSA — actions.js  (Ledger V3)
   Unico punto di accesso per tutte le operazioni
   che modificano i dati.

   FLUSSO
   ─────────────────────────────────────────────────────
   UI → Actions → normalize → validate → guard → DB
      → State (cache) → Render

   REGOLE
   ─────────────────────────────────────────────────────
   • Solo Actions chiama DB.*
   • Solo Actions modifica State.trips / expenses / settlements
   • Ogni action mutante restituisce Ok(value) | Err(errors[])
   • NESSUN throw per errori di dominio — sempre Err(codes)
   • IDs sempre con crypto.randomUUID()
   • Non si salva mai derived state (balances, totali…)
   ===================================================== */

import { DB }    from './indexedDb.js';
import { State } from './state.js';

import { Ok, Err } from './domain/result.js';
import {
  normalizeExpense,
  normalizeExpenseUpdate,
  normalizeTrip,
  normalizeParticipant,
  normalizeSettlement,
} from './domain/normalize.js';
import {
  validateExpense,
  validateTrip,
  validateParticipant,
  validateSettlement,
} from './domain/validators.js';
import {
  G,
  checkTripExists,
  checkExpenseNotDeleted,
} from './domain/actionGuards.js';

export const Actions = {

  // ── Init ──────────────────────────────────────────────

  async init() {
    try {
      if (navigator.storage?.persist) {
        const persisted = await navigator.storage.persist();
        console.log(`[Actions] Storage persistente: ${persisted ? '✓ garantito' : '⚠ non garantito'}`);
      }
    } catch (_) { /* ignore */ }

    await DB.init();
    await _migrateV1toV2IfNeeded();

    State.trips       = await DB.trips.getAll();
    State.allExpenses = await DB.expenses.getAll();

    let settings = await DB.settings.get();
    if (!settings) {
      settings = { theme: 'light', defaultCurrency: '€', onboardingCompleted: false, schemaVersion: 12 };
      await DB.settings.save(settings);
    }

    // Catena migrazioni — ogni step è idempotente
    if ((settings.schemaVersion ?? 0) < 3) {
      await _migrateToCents();
      settings.schemaVersion = 3;
      await DB.settings.save(settings);
      State.allExpenses = await DB.expenses.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 4) {
      await _migrateToV4();
      settings.schemaVersion = 4;
      await DB.settings.save(settings);
      State.trips       = await DB.trips.getAll();
      State.allExpenses = await DB.expenses.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 5) {
      await _reconcileAmounts();
      settings.schemaVersion = 5;
      await DB.settings.save(settings);
      State.allExpenses = await DB.expenses.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 6) {
      await _cleanupLegacyAmountField();
      settings.schemaVersion = 6;
      await DB.settings.save(settings);
      State.allExpenses = await DB.expenses.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 7) {
      await _migrateToV7();
      settings.schemaVersion = 7;
      await DB.settings.save(settings);
      State.trips = await DB.trips.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 8) {
      await _migrateToV8();
      settings.schemaVersion = 8;
      await DB.settings.save(settings);
      State.allExpenses = await DB.expenses.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 9) {
      // Ledger V3: splits+paidByParticipantId → consumers+payers
      // Rimuove personal/ownerId/shares/liabilityOwnerId
      await _migrateToV9();
      settings.schemaVersion = 9;
      await DB.settings.save(settings);
      State.trips       = await DB.trips.getAll();
      State.allExpenses = await DB.expenses.getAll();
      console.log('[Actions] Migrazione v8→v9 (Ledger V3) completata');
    }
    if ((settings.schemaVersion ?? 0) < 10) {
      // Rimuove settlements orfani: trip senza spese attive
      await _migrateToV10();
      settings.schemaVersion = 10;
      await DB.settings.save(settings);
    }
    if ((settings.schemaVersion ?? 0) < 11) {
      // Assegna avatarIndex ai partecipanti che non ce l'hanno
      await _migrateToV11();
      settings.schemaVersion = 11;
      await DB.settings.save(settings);
      State.trips = await DB.trips.getAll();
    }
    if ((settings.schemaVersion ?? 0) < 12) {
      // Aggiunge type: 'viaggio' ai trip esistenti senza type
      await _migrateToV12();
      settings.schemaVersion = 12;
      await DB.settings.save(settings);
      State.trips = await DB.trips.getAll();
      console.log('[Actions] Migrazione v11→v12 (trip.type) completata');
    }

    State.settings = settings;

    if (State.trips.length === 0) {
      await _seedDemo();
      State.allExpenses = await DB.expenses.getAll();
    }

    console.log(`[Actions] ✓ Pronto — ${State.trips.length} evento/i, schema v${settings.schemaVersion}`);
    State.trips.forEach(t =>
      console.log(`  [trip] "${t.name}" — ${t.participants.length} partecipanti`)
    );
    if (location.protocol === 'file:') {
      console.warn('[Actions] ⚠ App aperta via file:// — IndexedDB potrebbe non persistere in alcuni browser.');
    }
  },

  // ── Trips ─────────────────────────────────────────────

  async createTrip(data) {
    const trip = normalizeTrip(data);
    const v    = validateTrip(trip);
    if (!v.valid) return Err(v.errors);

    await DB.trips.save(trip);
    State.trips.push(trip);
    return Ok(trip);
  },

  async updateTrip(tripId, changes) {
    const trip = _findTrip(tripId);
    const g    = checkTripExists(trip);
    if (!g.ok) return g;

    Object.assign(trip, changes, { updatedAt: _now() });
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(trip);
  },

  async archiveTrip(tripId) {
    const trip = _findTrip(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);
    trip.archivedAt = _now();
    trip.updatedAt  = _now();
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(trip);
  },

  async unarchiveTrip(tripId) {
    const trip = _findTrip(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);
    trip.archivedAt = null;
    trip.updatedAt  = _now();
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(trip);
  },

  async deleteTrip(tripId) {
    const expenses    = await DB.expenses.getByTrip(tripId);
    const settlements = await DB.settlements.getByTrip(tripId);

    for (const e of expenses) {
      const atts = await DB.attachments.getByExpense(e.id);
      for (const a of atts) await DB.attachments.delete(a.id);
      await DB.expenses.delete(e.id);
    }
    for (const s of settlements) await DB.settlements.delete(s.id);
    await DB.trips.delete(tripId);

    State.trips = State.trips.filter(t => t.id !== tripId);
    if (State.currentTrip?.id === tripId) {
      State.currentTrip = null;
      State.expenses    = [];
      State.settlements = [];
    }
  },

  // ── Participants (nested nel trip) ────────────────────

  async addParticipant(tripId, data) {
    const trip = _findTrip(tripId);
    const g    = checkTripExists(trip);
    if (!g.ok) return g;

    const participant = normalizeParticipant({ ...data, color: data.color ?? _nextColor() });
    const v           = validateParticipant(participant);
    if (!v.valid) return Err(v.errors);

    trip.participants.push(participant);
    trip.updatedAt = _now();
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(participant);
  },

  async updateParticipant(tripId, participantId, changes) {
    const trip = _findTrip(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);
    const p = trip.participants.find(p => p.id === participantId);
    if (!p) return Err([G.PARTICIPANT_NOT_FOUND]);
    Object.assign(p, changes);
    trip.updatedAt = _now();
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(p);
  },

  async removeParticipant(tripId, participantId) {
    const trip = _findTrip(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);
    trip.participants = trip.participants.filter(p => p.id !== participantId);
    trip.updatedAt    = _now();
    await DB.trips.save(trip);
    if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    return Ok(null);
  },

  // ── Expenses ──────────────────────────────────────────

  async loadExpenses(tripId) {
    State.expenses = await DB.expenses.getByTrip(tripId);
  },

  async createExpense(tripId, data) {
    const trip = _findTrip(tripId);
    const g    = checkTripExists(trip);
    if (!g.ok) return g;

    const expense = normalizeExpense(tripId, data);
    const v       = validateExpense(expense);
    if (!v.valid) return Err(v.errors);

    await DB.expenses.save(expense);
    State.expenses.push(expense);
    State.allExpenses.push(expense);
    State.expensesRevision++;
    return Ok(expense);
  },

  async updateExpense(expenseId, changes) {
    const exp = State.expenses.find(e => e.id === expenseId);
    const g   = checkExpenseNotDeleted(exp);
    if (!g.ok) return g;

    const updated = normalizeExpenseUpdate(exp, changes);
    const v       = validateExpense(updated);
    if (!v.valid) return Err(v.errors);

    Object.assign(exp, updated);
    await DB.expenses.save(exp);
    State.expensesRevision++;
    return Ok(exp);
  },

  async deleteExpense(expenseId) {
    const exp = State.expenses.find(e => e.id === expenseId);
    if (!exp) return Err([G.EXPENSE_NOT_FOUND]);

    exp.deletedAt = _now();
    exp.updatedAt = _now();
    await DB.expenses.save(exp);
    const allExp = State.allExpenses.find(e => e.id === expenseId);
    if (allExp) { allExp.deletedAt = exp.deletedAt; allExp.updatedAt = exp.updatedAt; }
    State.expensesRevision++;

    // Se non restano spese attive, i settlements confermati diventano
    // "orfani" e creano debiti artificiali → li eliminiamo.
    const activeLeft = State.expenses.filter(e => !e.deletedAt);
    if (activeLeft.length === 0 && State.settlements.length > 0) {
      for (const s of [...State.settlements]) {
        await DB.settlements.delete(s.id);
      }
      State.settlements = [];
    }

    return Ok(exp);
  },

  async restoreExpense(expenseId) {
    const exp = State.expenses.find(e => e.id === expenseId);
    if (!exp) return Err([G.EXPENSE_NOT_FOUND]);

    exp.deletedAt = null;
    exp.updatedAt = _now();
    await DB.expenses.save(exp);
    const allExp = State.allExpenses.find(e => e.id === expenseId);
    if (allExp) { allExp.deletedAt = null; allExp.updatedAt = exp.updatedAt; }
    State.expensesRevision++;
    return Ok(exp);
  },

  // ── Settlements ───────────────────────────────────────

  async loadSettlements(tripId) {
    State.settlements = await DB.settlements.getByTrip(tripId);
  },

  async confirmSettlement(tripId, data) {
    const trip = _findTrip(tripId);
    const g    = checkTripExists(trip);
    if (!g.ok) return g;

    const settlement = normalizeSettlement(tripId, data);
    const v          = validateSettlement(settlement);
    if (!v.valid) return Err(v.errors);

    await DB.settlements.save(settlement);
    State.settlements.push(settlement);
    return Ok(settlement);
  },

  async deleteSettlement(settlementId) {
    await DB.settlements.delete(settlementId);
    State.settlements = State.settlements.filter(s => s.id !== settlementId);
    return Ok(null);
  },

  // ── Transport date sync ───────────────────────────────

  /**
   * Aggiorna startDate (andata) o endDate (ritorno) dei partecipanti indicati.
   * Usato dopo il salvataggio di una spesa di trasporto per sincronizzare
   * le date di presenza con la data di viaggio.
   *
   * @param {string}   tripId
   * @param {string[]} participantIds
   * @param {string}   date  — ISO date string "YYYY-MM-DD"
   * @param {string}   type  — 'andata' | 'ritorno'
   */
  async syncTransportDates(tripId, participantIds, date, type) {
    const trip = _findTrip(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);

    let updated = 0;
    for (const pid of participantIds) {
      const p = trip.participants.find(p => p.id === pid);
      if (!p) continue;
      if (type === 'andata')  p.startDate = date;
      else                    p.endDate   = date;
      updated++;
    }

    if (updated > 0) {
      trip.updatedAt = _now();
      await DB.trips.save(trip);
      if (State.currentTrip?.id === tripId) State.currentTrip = trip;
    }

    return Ok({ updated });
  },

  // ── Export / Import ───────────────────────────────────

  /**
   * Esporta un viaggio completo come oggetto JSON-serializzabile.
   * Include: trip (participants, groups), expenses, settlements.
   * Esclude: attachments blob (troppo pesanti per JSON).
   *
   * @param {string} tripId
   * @returns {Promise<Ok<object>>}
   */
  async exportTrip(tripId) {
    const trip        = await DB.trips.get(tripId);
    if (!trip) return Err([G.TRIP_NOT_FOUND]);

    const expenses    = await DB.expenses.getByTrip(tripId);
    const settlements = await DB.settlements.getByTrip(tripId);

    const bundle = {
      _cambusa:    true,
      _version:    1,
      _exportedAt: new Date().toISOString(),
      trip,
      expenses,
      settlements,
    };

    return Ok(bundle);
  },

  /**
   * Importa un viaggio da un bundle JSON esportato.
   * Assegna nuovi IDs per evitare conflitti con dati esistenti.
   *
   * @param {object} bundle — risultato di exportTrip()
   * @returns {Promise<Ok<{trip}> | Err>}
   */
  async importTrip(bundle) {
    if (!bundle?._cambusa) return Err(['INVALID_BUNDLE']);

    // Mappa ID vecchi → nuovi
    const idMap = {};
    const newId = () => crypto.randomUUID();
    const remap = (oldId) => {
      if (!idMap[oldId]) idMap[oldId] = newId();
      return idMap[oldId];
    };

    // Remap Trip
    const oldTrip = bundle.trip;
    const newTripId = remap(oldTrip.id);
    const newParticipants = (oldTrip.participants ?? []).map(p => {
      const newPid = remap(p.id);
      return { ...p, id: newPid };
    });
    const newGroups = (oldTrip.groups ?? []).map(g => ({
      ...g,
      id:      remap(g.id),
      members: (g.members ?? []).map(mid => remap(mid)),
    }));
    const newTrip = {
      ...oldTrip,
      id:           newTripId,
      name:         oldTrip.name + ' (importato)',
      participants: newParticipants,
      groups:       newGroups,
      updatedAt:    _now(),
    };
    await DB.trips.save(newTrip);
    State.trips.push(newTrip);

    // Remap Expenses
    for (const exp of (bundle.expenses ?? [])) {
      const newExpId = remap(exp.id);
      const newConsumers = (exp.consumers ?? []).map(c => ({
        ...c, participantId: remap(c.participantId),
      }));
      const newPayers = (exp.payers ?? []).map(p => ({
        ...p, participantId: remap(p.participantId),
      }));
      const newExp = {
        ...exp,
        id:         newExpId,
        tripId:     newTripId,
        consumers:  newConsumers,
        payers:     newPayers,
        updatedAt:  _now(),
      };
      await DB.expenses.save(newExp);
      State.allExpenses.push(newExp);
    }

    // Remap Settlements
    for (const s of (bundle.settlements ?? [])) {
      const newS = {
        ...s,
        id:                  remap(s.id),
        tripId:              newTripId,
        fromParticipantId:   remap(s.fromParticipantId),
        toParticipantId:     remap(s.toParticipantId),
        updatedAt:           _now(),
      };
      await DB.settlements.save(newS);
    }

    return Ok({ trip: newTrip });
  },

  // ── Settings ──────────────────────────────────────────

  async saveSettings(prefs) {
    const merged = { ...(State.settings ?? {}), ...prefs };
    await DB.settings.save(merged);
    State.settings = merged;
    return Ok(merged);
  },
};

// ── Migrazione v10: rimuovi settlements orfani ────────
// Un settlement è "orfano" se il suo trip non ha spese attive (non cancellate).
// Succede quando l'utente cancella tutte le spese dopo aver confermato pagamenti.
async function _migrateToV10() {
  const allExpenses    = await DB.expenses.getAll();
  const allSettlements = await DB.settlements.getAll();

  // Mappa tripId → ha almeno una spesa attiva?
  const tripHasActive = {};
  for (const e of allExpenses) {
    if (!e.deletedAt) tripHasActive[e.tripId] = true;
  }

  let removed = 0;
  for (const s of allSettlements) {
    if (!tripHasActive[s.tripId]) {
      await DB.settlements.delete(s.id);
      removed++;
    }
  }

  if (removed > 0) console.log(`[Actions] _migrateToV10: ${removed} settlement orfani rimossi`);
}

// ── Migrazione v11: assegna avatarIndex ai partecipanti ──
// Partecipanti creati prima della v52 non hanno avatarIndex.
// Assegna un indice deterministico basato sulla posizione nel viaggio.
// IDEMPOTENTE: salta partecipanti che hanno già un indice.
async function _migrateToV11() {
  const trips = await DB.trips.getAll();
  let updated = 0;
  for (const trip of trips) {
    let changed = false;
    trip.participants = trip.participants.map((p, idx) => {
      if (p.avatarIndex === null || p.avatarIndex === undefined) {
        changed = true;
        return { ...p, avatarIndex: idx % 47 };
      }
      return p;
    });
    if (changed) {
      await DB.trips.save(trip);
      updated++;
    }
  }
  if (updated > 0) console.log(`[Actions] _migrateToV11: avatarIndex assegnato in ${updated} viaggio/i`);
}

// ── Migrazione v12: aggiunge trip.type ────────────────
// I trip creati prima della v96 non hanno il campo type.
// Default: 'viaggio' — retrocompatibile.
// IDEMPOTENTE: salta trip che hanno già il campo.
async function _migrateToV12() {
  const trips = await DB.trips.getAll();
  let updated = 0;
  for (const trip of trips) {
    if (!trip.type) {
      trip.type = 'viaggio';
      await DB.trips.save(trip);
      updated++;
    }
  }
  if (updated > 0) console.log(`[Actions] _migrateToV12: type aggiunto a ${updated} trip`);
}

// ── Migrazione v9: Ledger V3 ──────────────────────────
// Converte expenses da {splits[], paidByParticipantId} a {consumers[], payers[]}.
// Soft-deletes le spese personali (non esistono in V3).
// Rimuove shares, liabilityOwnerId, delegatedTo dai partecipanti.
// IDEMPOTENTE: salta expenses che hanno già consumers[]+payers[].
async function _migrateToV9() {
  const trips   = await DB.trips.getAll();
  const tripMap = Object.fromEntries(trips.map(t => [t.id, t]));
  const expenses = await DB.expenses.getAll();
  let converted = 0, softDeleted = 0;

  for (const exp of expenses) {
    // Soft-delete spese personali — non hanno posto nel ledger V3
    if (exp.personal && !exp.deletedAt) {
      exp.deletedAt = _now();
      exp.updatedAt = _now();
      await DB.expenses.save(exp);
      softDeleted++;
      continue;
    }

    // Già migrata: ha consumers e payers
    if (Array.isArray(exp.consumers) && Array.isArray(exp.payers)) continue;
    if (exp.deletedAt) continue;

    // consumers ← splits[]
    let consumers = (exp.splits ?? []).map(s => ({
      participantId: s.participantId,
      shares:        s.shares ?? 1,
    }));

    // Fallback: se splits era vuoto, usa tutti i partecipanti del trip con shares=1
    if (consumers.length === 0 && tripMap[exp.tripId]) {
      consumers = (tripMap[exp.tripId].participants ?? []).map(p => ({
        participantId: p.id,
        shares:        1,
      }));
    }

    // payers ← paidByParticipantId (singolo payer, sharesPaid=1)
    const payers = [];
    if (exp.paidByParticipantId) {
      payers.push({ participantId: exp.paidByParticipantId, sharesPaid: 1 });
    } else if (consumers.length > 0) {
      payers.push({ participantId: consumers[0].participantId, sharesPaid: 1 });
    }

    // Costruisce la nuova expense, rimuove i campi legacy
    const newExp = { ...exp, consumers, payers, updatedAt: _now() };
    delete newExp.splits;
    delete newExp.paidByParticipantId;
    delete newExp.personal;
    delete newExp.ownerId;
    delete newExp.splitMode;

    await DB.expenses.save(newExp);
    converted++;
  }

  // Rimuove campi legacy dai partecipanti
  let tripsUpdated = 0;
  for (const trip of trips) {
    let dirty = false;
    for (const p of (trip.participants ?? [])) {
      const hadLegacy = 'shares' in p || 'liabilityOwnerId' in p || 'delegatedTo' in p;
      if (hadLegacy) {
        delete p.shares;
        delete p.liabilityOwnerId;
        delete p.delegatedTo;
        dirty = true;
      }
    }
    if (dirty) { await DB.trips.save(trip); tripsUpdated++; }
  }

  console.log(`[Actions] _migrateToV9: ${converted} spese convertite, ${softDeleted} personali archiviate, ${tripsUpdated} trip aggiornati`);
}

// ── Migrazioni legacy (v1–v8) ─────────────────────────

async function _migrateToCents() {
  const expenses = await DB.expenses.getAll();
  for (const exp of expenses) {
    await DB.expenses.save({ ...exp, amount: Math.round(exp.amount * 100) });
  }
  const settlements = await DB.settlements.getAll();
  for (const s of settlements) {
    await DB.settlements.save({ ...s, amount: Math.round(s.amount * 100) });
  }
}

async function _migrateToV4() {
  const expenses = await DB.expenses.getAll();
  for (const exp of expenses) {
    let dirty = false;
    if (typeof exp.amountCents !== 'number') { exp.amountCents = Math.round(exp.amount ?? 0); dirty = true; }
    if (!('deletedAt' in exp)) { exp.deletedAt = null; dirty = true; }
    if (!('personal'  in exp)) { exp.personal  = false; dirty = true; }
    if (!('ownerId'   in exp)) { exp.ownerId   = null;  dirty = true; }
    if (dirty) await DB.expenses.save(exp);
  }
  const settlements = await DB.settlements.getAll();
  for (const s of settlements) {
    if (typeof s.amountCents !== 'number') {
      await DB.settlements.save({ ...s, amountCents: Math.round(s.amount ?? 0) });
    }
  }
  const trips = await DB.trips.getAll();
  for (const trip of trips) {
    let dirty = false;
    for (const p of (trip.participants ?? [])) {
      if (!('delegatedTo' in p)) { p.delegatedTo = null; dirty = true; }
    }
    if (dirty) await DB.trips.save(trip);
  }
}

async function _reconcileAmounts() {
  const expenses = await DB.expenses.getAll();
  for (const exp of expenses) {
    if (exp.amountCents !== exp.amount) {
      exp.amountCents = exp.amount ?? 0;
      await DB.expenses.save(exp);
    }
  }
  const settlements = await DB.settlements.getAll();
  for (const s of settlements) {
    if (s.amountCents !== s.amount) {
      s.amountCents = s.amount ?? 0;
      await DB.settlements.save(s);
    }
  }
}

async function _cleanupLegacyAmountField() {
  const expenses = await DB.expenses.getAll();
  for (const exp of expenses) {
    if ('amount' in exp) {
      const clean = { ...exp };
      delete clean.amount;
      await DB.expenses.save(clean);
    }
  }
  const settlements = await DB.settlements.getAll();
  for (const s of settlements) {
    if ('amount' in s) {
      const clean = { ...s };
      delete clean.amount;
      await DB.settlements.save(clean);
    }
  }
}

async function _migrateToV7() {
  const trips = await DB.trips.getAll();
  for (const trip of trips) {
    let dirty = false;
    for (const p of (trip.participants ?? [])) {
      if (!('liabilityOwnerId' in p)) {
        p.liabilityOwnerId = p.delegatedTo ?? null;
        delete p.delegatedTo;
        dirty = true;
      }
    }
    if (dirty) await DB.trips.save(trip);
  }
}

async function _migrateToV8() {
  const trips    = await DB.trips.getAll();
  const tripMap  = Object.fromEntries(trips.map(t => [t.id, t]));
  const expenses = await DB.expenses.getAll();

  for (const exp of expenses) {
    if (exp.personal || exp.deletedAt) continue;
    if (Array.isArray(exp.splits) && exp.splits.length > 0) continue;
    const trip = tripMap[exp.tripId];
    if (!trip) continue;
    let candidates = (trip.participants ?? []).filter(p => (p.shares ?? 1) > 0);
    if (candidates.length === 0) candidates = trip.participants.map(p => ({ ...p, shares: 1 }));
    exp.splits = candidates.map(p => ({ participantId: p.id, shares: p.shares ?? 1 }));
    await DB.expenses.save(exp);
  }
}

async function _migrateV1toV2IfNeeded() {
  const trips = await DB.trips.getAll();
  let migratedExpenses = 0, migratedSettlements = 0;

  for (const trip of trips) {
    const hasNested = Array.isArray(trip.expenses) && trip.expenses.length > 0;
    const hasSets   = Array.isArray(trip.settlements) && trip.settlements.length > 0;
    if (!hasNested && !hasSets) continue;

    if (hasNested) {
      for (const exp of trip.expenses) {
        await DB.expenses.save({ ...exp, tripId: trip.id });
        migratedExpenses++;
      }
    }
    if (hasSets) {
      for (const s of trip.settlements) {
        await DB.settlements.save({ ...s, tripId: trip.id });
        migratedSettlements++;
      }
    }
    const clean = { ...trip };
    delete clean.expenses;
    delete clean.settlements;
    clean.updatedAt = _now();
    await DB.trips.save(clean);
  }

  if (migratedExpenses + migratedSettlements > 0) {
    console.log(`[Actions] v1→v2: ${migratedExpenses} spese, ${migratedSettlements} saldi migrati`);
  }
}

// ── Seed demo (solo al primo avvio) ───────────────────
async function _seedDemo() {
  const tripId = crypto.randomUUID();
  const p1 = _participant('Marco',          '#10b981');
  const p2 = _participant('Sara + Luca',    '#3b82f6');
  const p3 = _participant('Famiglia Rossi', '#f97316', '2026-08-12', null);
  const p4 = _participant('Marta',          '#8b5cf6', null, '2026-08-18');

  const trip = {
    id:           tripId,
    name:         'Grecia 2026',
    location:     'Creta',
    startDate:    '2026-08-10',
    endDate:      '2026-08-20',
    currency:     '€',
    type:         'viaggio',
    participants: [p1, p2, p3, p4],
    groups: [
      { id: crypto.randomUUID(), name: 'Bevitori',     members: [p1.id, p2.id] },
      { id: crypto.randomUUID(), name: 'Non bevitori', members: [p3.id, p4.id] },
    ],
    createdAt: _now(),
    updatedAt: _now(),
  };
  await DB.trips.save(trip);
  State.trips.push(trip);

  const rawExpenses = [
    {
      title: 'Coop', date: '2026-08-14', amountCents: 6200, category: 'spesa',
      consumers: [
        { participantId: p1.id, shares: 1 },
        { participantId: p2.id, shares: 2 },
        { participantId: p3.id, shares: 3 },
        { participantId: p4.id, shares: 1 },
      ],
      payers: [{ participantId: p1.id, sharesPaid: 1 }],
    },
    {
      title: 'Taxi Museo', date: '2026-08-14', amountCents: 1800, category: 'trasporti',
      consumers: [
        { participantId: p1.id, shares: 1 },
        { participantId: p2.id, shares: 2 },
        { participantId: p4.id, shares: 1 },
      ],
      payers: [{ participantId: p2.id, sharesPaid: 1 }],
    },
    {
      title: 'Taverna', date: '2026-08-15', amountCents: 8400, category: 'cibo',
      consumers: [
        { participantId: p1.id, shares: 1 },
        { participantId: p2.id, shares: 2 },
        { participantId: p3.id, shares: 3 },
        { participantId: p4.id, shares: 1 },
      ],
      payers: [{ participantId: p3.id, sharesPaid: 1 }],
    },
  ];

  for (const data of rawExpenses) {
    await DB.expenses.save({
      id:            crypto.randomUUID(),
      tripId,
      currency:      '€',
      notes:         '',
      deletedAt:     null,
      attachmentIds: [],
      createdAt:     _now(),
      updatedAt:     _now(),
      ...data,
    });
  }

  console.log('[Actions] Seed demo salvato (Ledger V3)');
}

// ── Helpers privati ───────────────────────────────────

function _findTrip(id) {
  return State.trips.find(t => t.id === id) ?? null;
}

function _now() { return new Date().toISOString(); }

function _participant(name, color, startDate = null, endDate = null) {
  return {
    id: crypto.randomUUID(),
    name,
    color,
    startDate,
    endDate,
  };
}

const _palette = ['#10b981','#3b82f6','#f97316','#8b5cf6','#ef4444','#eab308','#06b6d4','#ec4899'];
let   _palIdx  = 0;
function _nextColor() { return _palette[_palIdx++ % _palette.length]; }
