/* =====================================================
   CAMBUSA — domain/normalize.js  (Ledger V3)
   Conversione input grezzo → entità di dominio pulita.

   V3: expenses usano consumers[] + payers[].
   Participant è solo anagrafica: id, name, color, startDate, endDate.
   ===================================================== */

// ── Helpers interni ───────────────────────────────────

/** Converte euro (float UI) in centesimi (integer DB). */
export function toCents(v) {
  return Math.round(parseFloat(v) * 100);
}

export function now()   { return new Date().toISOString(); }
export function today() { return new Date().toISOString().slice(0, 10); }

// ── Normalizers ───────────────────────────────────────

/**
 * Normalizza un payload spesa in ingresso dall'UI.
 * Accetta amountCents (integer) o amount (float euro).
 * Produce consumers[] e payers[] canonici.
 *
 * @param {string} tripId
 * @param {object} input
 * @returns {object} expense pronta per validateExpense()
 */
export function normalizeExpense(tripId, input) {
  const amountCents = Number.isInteger(input.amountCents)
    ? input.amountCents
    : toCents(input.amount ?? 0);

  return {
    id:           input.id ?? crypto.randomUUID(),
    tripId,
    title:        (input.title ?? '').trim(),
    category:     (input.category ?? 'altro').trim(),
    amountCents,
    currency:     input.currency ?? '€',
    date:         input.date ?? today(),
    notes:        (input.notes ?? '').trim(),
    consumers:    (input.consumers ?? []).map(c => ({
      participantId: c.participantId,
      shares:        (typeof c.shares === 'number' && c.shares >= 0) ? c.shares : 1,
    })),
    payers:       (input.payers ?? []).map(p => ({
      participantId: p.participantId,
      sharesPaid:    (typeof p.sharesPaid === 'number' && p.sharesPaid > 0) ? p.sharesPaid : 1,
      paid:          p.paid !== false, // true = già versato, false = da versare
    })),
    splitMeta:    input.splitMeta   ?? null,
    deletedAt:    input.deletedAt   ?? null,
    attachmentIds: input.attachmentIds ?? [],
    createdAt:    input.createdAt   ?? now(),
    updatedAt:    now(),
  };
}

/**
 * Normalizza i campi modificati di una spesa esistente (update parziale).
 * Mantiene i campi immutabili (id, tripId, createdAt) e aggiorna updatedAt.
 *
 * @param {object} existing  — spesa attuale da State
 * @param {object} changes   — campi da aggiornare
 * @returns {object} spesa aggiornata pronta per validateExpense()
 */
export function normalizeExpenseUpdate(existing, changes) {
  const normalized = { ...changes };
  if (normalized.amount !== undefined && !Number.isInteger(normalized.amountCents)) {
    normalized.amountCents = toCents(normalized.amount);
  }
  const updated = {
    ...existing,
    ...normalized,
    id:        existing.id,
    tripId:    existing.tripId,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  delete updated.amount;
  return updated;
}

/**
 * Normalizza un payload trip in ingresso.
 *
 * @param {object} input
 * @returns {object} trip pronta per validateTrip()
 */
export function normalizeTrip(input) {
  return {
    id:           input.id         ?? crypto.randomUUID(),
    name:         (input.name ?? '').trim(),
    location:     (input.location ?? '').trim(),
    startDate:    input.startDate  ?? '',
    endDate:      input.endDate    ?? '',
    currency:     input.currency   ?? '€',
    type:         input.type       ?? 'viaggio',
    participants: input.participants ?? [],
    groups:       input.groups       ?? [],
    createdAt:    input.createdAt  ?? now(),
    updatedAt:    now(),
  };
}

/**
 * Normalizza un payload partecipante.
 * V3: solo anagrafica — nessun campo shares o delega.
 *
 * @param {object} input
 * @returns {object} participant pronto per validateParticipant()
 */
export function normalizeParticipant(input) {
  return {
    id:          input.id          ?? crypto.randomUUID(),
    name:        (input.name ?? '').trim(),
    color:       input.color       ?? '#10b981',
    avatarIndex: input.avatarIndex ?? null,   // 0–31 → avatar locale, null → iniziale colorata
    startDate:   input.startDate   ?? null,
    endDate:     input.endDate     ?? null,
  };
}

/**
 * Normalizza un payload settlement.
 * data.amountCents arriva già come integer cents dal balance engine.
 *
 * @param {string} tripId
 * @param {object} input
 * @returns {object} settlement pronto per validateSettlement()
 */
export function normalizeSettlement(tripId, input) {
  const amountCents = Number.isInteger(input.amountCents)
    ? input.amountCents
    : Math.round(input.amount ?? 0);
  return {
    id:                input.id    ?? crypto.randomUUID(),
    tripId,
    fromParticipantId: input.fromParticipantId,
    toParticipantId:   input.toParticipantId,
    amountCents,
    date:              input.date  ?? today(),
    note:              (input.note ?? '').trim(),
    confirmed:         true,
    createdAt:         input.createdAt ?? now(),
  };
}
