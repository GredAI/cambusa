/* =====================================================
   CAMBUSA — domain/recurrence.js
   Logica per le spese ricorrenti.

   RICORRENZE SUPPORTATE
   ─────────────────────────────────────────────────────
   • daily   — ogni giorno
   • weekly  — ogni settimana
   • monthly — ogni mese
   ===================================================== */

export const RECURRENCE_OPTIONS = [
  { id: 'daily',   label: 'Giornaliera', icon: '📆' },
  { id: 'weekly',  label: 'Settimanale', icon: '📅' },
  { id: 'monthly', label: 'Mensile',     icon: '🗓' },
];

export function recurrenceLabel(r) {
  return RECURRENCE_OPTIONS.find(o => o.id === r)?.label ?? r;
}

/**
 * Data della prossima scadenza del template.
 * Se non ancora mai generato, la scadenza è la startDate.
 *
 * @param {object} template
 * @returns {string|null}  YYYY-MM-DD
 */
export function nextDueDate(template) {
  if (!template?.active) return null;

  if (!template.lastGenerated) {
    return template.startDate ?? null;
  }

  const d = new Date(template.lastGenerated);
  switch (template.recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1);    break;
    case 'weekly':  d.setDate(d.getDate() + 7);    break;
    case 'monthly': d.setMonth(d.getMonth() + 1);  break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Vero se il template è in scadenza oggi o già scaduto.
 */
export function isDue(template) {
  const next = nextDueDate(template);
  if (!next) return false;
  const today = new Date().toISOString().slice(0, 10);
  return next <= today;
}

/**
 * Template attivi con scadenza <= oggi.
 */
export function pendingTemplates(trip) {
  return (trip?.recurringTemplates ?? [])
    .filter(t => t.active !== false && isDue(t));
}

/**
 * Etichetta leggibile della prossima scadenza.
 */
export function dueDateLabel(template) {
  const next = nextDueDate(template);
  if (!next) return '—';
  const today = new Date().toISOString().slice(0, 10);
  if (next < today)  return 'Scaduta';
  if (next === today) return 'Oggi';
  return new Date(next).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
