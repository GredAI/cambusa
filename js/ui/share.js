/* =====================================================
   CAMBUSA — ui/share.js  (Ledger V3)
   Condivisione riepilogo viaggio.

   PRIORITÀ
   ─────────────────────────────────────────────────────
   1. Web Share API  → foglio di condivisione nativo iOS/Android
   2. Clipboard API  → copia + toast "Copiato"
   3. Fallback       → textarea selezionabile
   ===================================================== */

import { State }     from '../state.js';
import { Selectors } from '../selectors.js';
import { isGroupExpense } from '../domain/guards.js';

export const Share = {

  async trip(trip) {
    const text  = _buildSummary(trip);
    const title = trip.name;

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return 'shared';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return 'copied';
      } catch (_) { /* fallthrough */ }
    }

    return 'error';
  },
};

// ── Costruisce il testo di riepilogo ──────────────────
function _buildSummary(trip) {
  const expenses    = State.expenses.filter(isGroupExpense);
  const balances    = Selectors.balances();
  const settlements = Selectors.suggestedSettlements();
  const confirmed   = State.settlements;
  const total       = Selectors.tripTotal();

  const f = d => new Date(d + 'T00:00:00')
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

  const lines = [];

  lines.push(`${trip.name}`);
  lines.push(`${trip.location} · ${f(trip.startDate)} – ${f(trip.endDate)}`);
  lines.push('');
  lines.push(`Totale: ${Selectors.formatCurrency(total)} · ${expenses.length} ${expenses.length === 1 ? 'spesa' : 'spese'}`);

  const pending = settlements.filter(s => {
    return !confirmed.some(
      c => c.fromParticipantId === s.from.id && c.toParticipantId === s.to.id
    );
  });

  if (pending.length) {
    lines.push('');
    lines.push('Da saldare:');
    pending.forEach(s => {
      lines.push(`• ${s.from.name} → ${s.to.name}: ${Selectors.formatCurrency(s.amountCents)}`);
    });
  } else {
    lines.push('');
    lines.push('✓ Tutti i conti sono in pari');
  }

  lines.push('');
  lines.push('Riepilogo:');
  balances.forEach(b => {
    const abs = Math.abs(b.balance);
    if (abs < 1) {
      lines.push(`• ${b.participant.name}: in pari`);
    } else if (b.balance > 0) {
      lines.push(`• ${b.participant.name}: è creditore di ${Selectors.formatCurrency(abs)}`);
    } else {
      lines.push(`• ${b.participant.name}: è debitore di ${Selectors.formatCurrency(abs)}`);
    }
  });

  lines.push('');
  lines.push('— Cambusa');

  return lines.join('\n');
}
