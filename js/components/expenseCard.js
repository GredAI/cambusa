/* =====================================================
   CAMBUSA — components/expenseCard.js  (Ledger V3)
   Componente riutilizzabile: card singola spesa.

   DEBT BREAKDOWN (V3)
   ─────────────────────────────────────────────────────
   Il pannello espandibile mostra:
   • Payers   → credito (+)  "anticipato"
   • Consumers → debito (−)  quota a carico

   Usa consumers[] e payers[] — no splits, no paidByParticipantId.
   ===================================================== */

import { Selectors }  from '../selectors.js';
import { readAmount, readConsumers, readPayers } from '../domain/guards.js';
import { participantAvatar } from './avatar.js';
import { catIcon } from './catIcon.js';

export const CAT_CONFIG = {
  cibo:      { label: 'Cibo'      },
  spesa:     { label: 'Spesa'     },
  trasporti: { label: 'Trasporti' },
  alloggio:  { label: 'Alloggio'  },
  attivita:  { label: 'Attività'  },
  noleggi:   { label: 'Noleggi'   },
  servizi:   { label: 'Servizi'   },
  altro:     { label: 'Altro'     },
};

/**
 * Calcola le righe di breakdown (payers + consumers) per la card.
 * Payers in cima (credito positivo), consumers sotto (debito negativo).
 *
 * @param {object} expense
 * @param {object} trip
 * @returns {Array<{participant, amountCents, isPayer}>}
 */
function _debtRows(expense, trip) {
  const amount = readAmount(expense);
  if (amount <= 0) return [];

  const rows = [];

  // ── Payers: credito ───────────────────────────────
  const payers  = readPayers(expense);
  const totalPS = payers.reduce((s, p) => s + (p.sharesPaid ?? 0), 0);
  if (totalPS > 0) {
    for (const p of payers) {
      const participant = trip.participants.find(x => x.id === p.participantId);
      if (!participant) continue;
      const amountCents = Math.round((p.sharesPaid ?? 0) * amount / totalPS);
      rows.push({ participant, amountCents, isPayer: true });
    }
  }

  // ── Consumers: debito ─────────────────────────────
  const consumers = readConsumers(expense);
  const totalCS   = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
  if (totalCS > 0) {
    for (const c of consumers) {
      const participant = trip.participants.find(x => x.id === c.participantId);
      if (!participant) continue;
      const amountCents = Math.round((c.shares ?? 0) * amount / totalCS);
      if (amountCents === 0) continue;
      rows.push({ participant, amountCents, isPayer: false });
    }
  }

  return rows;
}

/**
 * @param {object} expense
 * @param {object} trip
 * @param {object} [opts]
 * @param {boolean} [opts.deletable]  — mostra bottone elimina
 * @param {boolean} [opts.breakdown]  — mostra pannello debito espanso
 */
export function ExpenseCard(expense, trip, opts = {}) {
  const cat = CAT_CONFIG[expense.category] ?? CAT_CONFIG.altro;

  // Meta: nomi dei payer
  const payers     = readPayers(expense);
  const payerNames = payers
    .map(p => trip.participants.find(x => x.id === p.participantId)?.name ?? '—')
    .join(', ');
  const metaHtml = `Pagato da <span style="font-weight:600">${payerNames || '—'}</span>`;

  const rows         = _debtRows(expense, trip);
  const hasBreakdown = rows.length > 0;
  const isOpen       = opts.breakdown ?? false;

  const breakdownHtml = hasBreakdown ? `
    <div class="expense-breakdown ${isOpen ? 'expense-breakdown--open' : ''}"
         id="breakdown-${expense.id}">
      ${rows.map(r => `
        <div class="expense-breakdown__row">
          ${participantAvatar(r.participant, 'avatar--xs')}
          <span class="expense-breakdown__name">${r.participant.name}</span>
          ${r.isPayer
            ? `<span class="expense-breakdown__payer-badge">anticipato</span>`
            : ''}
          <span class="expense-breakdown__quota ${r.isPayer ? 'expense-breakdown__quota--payer' : ''}">
            ${r.isPayer ? '+' : '−'}${Selectors.formatCurrency(r.amountCents)}
          </span>
        </div>`).join('')}
    </div>` : '';

  return `
    <div class="expense-card ${isOpen ? 'expense-card--open' : ''}"
         data-expense-id="${expense.id}">
      <div class="expense-card__main">
        <div class="expense-card__icon cat-${expense.category}">${catIcon(expense.category, 20)}</div>
        <div class="expense-card__body">
          <strong class="expense-card__title">${expense.title}</strong>
          <p class="expense-card__meta">${metaHtml}</p>
          ${opts.groupName ? `<span class="expense-card__group-tag">👥 ${opts.groupName}</span>` : ''}
        </div>
        <div class="expense-card__right">
          <span class="expense-card__amount">${Selectors.formatCurrency(readAmount(expense))}</span>
          ${opts.deletable ? `
            <button class="expense-card__delete" data-delete-expense="${expense.id}"
                    aria-label="Elimina">×</button>` : ''}
          ${hasBreakdown ? `
            <button class="expense-card__chevron" data-toggle-breakdown="${expense.id}"
                    aria-label="Mostra quote" aria-expanded="${isOpen}">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>` : ''}
        </div>
      </div>
      ${breakdownHtml}
    </div>`;
}
