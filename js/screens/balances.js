/* =====================================================
   CAMBUSA — balances.js  (Ledger V3)
   "Chi deve dare quanto a chi?"

   UX PRINCIPI
   ─────────────────────────────────────────────────────
   • Linguaggio umano — mai numeri crudi
   • Settlement cards grandi e leggibili
   • Suggested vs Confirmed chiaramente separati
   • Zero state celebrativo
   ===================================================== */

import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav } from '../ui.js';
import { Toast }     from '../toast.js';
import { Share }     from '../ui/share.js';
import { participantAvatar } from '../components/avatar.js';
import { isGroupExpense, readAmount, readPayers } from '../domain/guards.js';

export const BalancesScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Viaggio non trovato.</p>';

    return `
      <div class="screen" id="screen-balances">
        ${Topbar({ title: 'Saldi', subtitle: trip.name, back: true, backNav: 'trip' })}
        <main class="screen-content" id="balances-content">
          ${_renderContent()}
        </main>
        ${BottomNav('balances')}
      </div>`;
  },

  mount() {
    document.getElementById('screen-balances')
      ?.addEventListener('click', async e => {

        if (e.target.closest('.btn-back')) {
          Router.go('trip', { tripId: State.currentTrip?.id });
          return;
        }

        // Segna come pagato
        const btn = e.target.closest('[data-confirm-settlement]');
        if (btn) {
          const card        = btn.closest('.settlement-card');
          const inputEl     = card?.querySelector('.settlement-card__amount-input');
          const euroAmount  = parseFloat(inputEl?.value) || 0;
          const amountCents = Math.round(euroAmount * 100);

          if (amountCents <= 0) {
            Toast.show('Inserisci un importo valido', { type: 'error' });
            return;
          }

          btn.disabled    = true;
          btn.textContent = '…';
          const result = await Actions.confirmSettlement(State.currentTrip.id, {
            fromParticipantId: btn.dataset.from,
            toParticipantId:   btn.dataset.to,
            amountCents,
            date:              new Date().toISOString().slice(0, 10),
          });
          if (!result.ok) {
            btn.disabled    = false;
            btn.textContent = 'Segna come pagato';
            Toast.show(result.errors[0], { type: 'error' });
            return;
          }
          Toast.show('Pagamento registrato', { type: 'success' });
          document.getElementById('balances-content').innerHTML = _renderContent();
          return;
        }

        // Annulla pagamento
        const del = e.target.closest('[data-delete-settlement]');
        if (del) {
          await Actions.deleteSettlement(del.dataset.deleteSettlement);
          Toast.show('Pagamento annullato', { type: 'info' });
          document.getElementById('balances-content').innerHTML = _renderContent();
          return;
        }

        // Condividi riepilogo (testo)
        if (e.target.closest('#btn-share')) {
          const result = await Share.trip(State.currentTrip);
          if (result === 'copied') Toast.show('Riepilogo copiato negli appunti');
          if (result === 'error')  Toast.show('Condivisione non disponibile', { type: 'error' });
          return;
        }

        // Condividi file HTML (Web Share API o download)
        if (e.target.closest('#btn-share-gist')) {
          await _shareHTMLFile(State.currentTrip);
          return;
        }

        // Export HTML
        if (e.target.closest('#btn-export-html')) {
          const html     = _buildStaticHTML(State.currentTrip);
          const slug     = State.currentTrip.name.replace(/\s+/g, '-').toLowerCase();
          const date     = new Date().toISOString().slice(0, 10);
          const filename = `cambusa-${slug}-${date}.html`;
          _downloadText(html, filename, 'text/html');
          Toast.show(`📄 ${filename} scaricato`);
          return;
        }

        // Export JSON
        if (e.target.closest('#btn-export-json')) {
          const result = await Actions.exportTrip(State.currentTrip.id);
          if (!result.ok) { Toast.show('Errore export', { type: 'error' }); return; }
          const json     = JSON.stringify(result.value, null, 2);
          const slug     = State.currentTrip.name.replace(/\s+/g, '-').toLowerCase();
          const date     = new Date().toISOString().slice(0, 10);
          const filename = `cambusa-${slug}-${date}.json`;
          _downloadText(json, filename, 'application/json');
          Toast.show(`📦 ${filename} scaricato`);
          return;
        }

        // Export CSV
        if (e.target.closest('#btn-export-csv')) {
          const csv      = _buildCSV(State.currentTrip);
          const slug     = State.currentTrip.name.replace(/\s+/g, '-').toLowerCase();
          const date     = new Date().toISOString().slice(0, 10);
          const filename = `cambusa-${slug}-${date}.csv`;
          _downloadText(csv, filename, 'text/csv;charset=utf-8');
          Toast.show(`📊 ${filename} scaricato`);
          return;
        }

        // Export PDF
        if (e.target.closest('#btn-export-pdf')) {
          Toast.show('Generazione PDF…');
          await _exportPDF(State.currentTrip);
          return;
        }

        // Dettaglio partecipante
        const pill = e.target.closest('[data-pid]');
        if (pill) {
          _openParticipantSheet(pill.dataset.pid, State.currentTrip);
          return;
        }

        // Chiudi sheet partecipante
        // — close btn, oppure click sul backdrop grigio (fuori dalla sheet)
        const onCloseBtn   = !!e.target.closest('#btn-sheet-close');
        const onBackdropBg = !!e.target.closest('#participant-sheet-backdrop')
                          && !e.target.closest('#participant-sheet');
        if (onCloseBtn || onBackdropBg) {
          document.getElementById('participant-sheet')?.remove();
          document.getElementById('participant-sheet-backdrop')?.remove();
          return;
        }

        const nav = e.target.closest('[data-nav]');
        if (!nav) return;
        const t = nav.dataset.nav;
        if (t === 'home') { Router.go('home'); return; }
        Router.go(t, { tripId: State.currentTrip?.id });
      });
  },

  unmount() {},
};

// ── Render contenuto ──────────────────────────────────
function _renderContent() {
  const balances  = Selectors.balances();
  const suggested = Selectors.suggestedSettlements();
  const gifts     = Selectors.giftSummary();
  const confirmed = State.settlements;
  const total     = Selectors.tripTotal();
  const nExp      = Selectors.activeGroupExpenseCount();

  return `
    ${_renderMiniStats(total, nExp)}
    ${_renderBalances(balances)}
    ${_renderSettlements(suggested, gifts, confirmed)}
    <div class="export-row">
      <button class="share-btn" id="btn-share" style="flex:1">
        <span>↑</span> Condividi
      </button>
      <button class="share-btn share-btn--gist" id="btn-share-gist" style="flex:1"
              title="Condividi il riepilogo come file HTML">
        📤 HTML
      </button>
    </div>
    <div class="export-row" style="margin-top:6px">
      <button class="export-btn" id="btn-export-pdf"  title="Esporta PDF">⬇ PDF</button>
      <button class="export-btn" id="btn-export-html" title="Esporta riepilogo HTML">⬇ HTML</button>
      <button class="export-btn" id="btn-export-csv"  title="Esporta spese CSV">⬇ CSV</button>
      <button class="export-btn" id="btn-export-json" title="Esporta dati JSON">⬇ JSON</button>
    </div>
  `;
}

// ── Mini stats ────────────────────────────────────────
function _renderMiniStats(total, nExp) {
  return `
    <div class="mini-stats card">
      <div class="mini-stat">
        <span class="mini-stat__value">${Selectors.formatCurrency(total)}</span>
        <span class="mini-stat__label">totale viaggio</span>
      </div>
      <div class="mini-stat__divider"></div>
      <div class="mini-stat">
        <span class="mini-stat__value">${nExp}</span>
        <span class="mini-stat__label">${nExp === 1 ? 'spesa' : 'spese'}</span>
      </div>
    </div>`;
}

// ── Helper: calcola anticipato e consumato per un partecipante ──
function _participantStats(participantId, expenses) {
  let advanced = 0, consumed = 0;
  for (const e of expenses) {
    const totalPS = (e.payers   ?? []).reduce((s, p)  => s + (p.sharesPaid ?? 0), 0);
    const totalCS = (e.consumers ?? []).reduce((s, c) => s + (c.shares     ?? 0), 0);
    const myPaid  = (e.payers   ?? []).find(p  => p.participantId  === participantId)?.sharesPaid ?? 0;
    const myCons  = (e.consumers ?? []).find(c => c.participantId  === participantId)?.shares     ?? 0;
    if (totalPS > 0) advanced += readAmount(e) * myPaid / totalPS;
    if (totalCS > 0) consumed += readAmount(e) * myCons  / totalCS;
  }
  return { advanced: Math.round(advanced), consumed: Math.round(consumed) };
}

// ── Saldo per partecipante ────────────────────────────
function _renderBalances(balances) {
  const expenses = State.expenses.filter(isGroupExpense);
  const fmt      = Selectors.formatCurrency.bind(Selectors);

  const rows = balances.map(b => {
    const abs = Math.abs(b.balance);
    const { advanced, consumed } = _participantStats(b.participant.id, expenses);

    let balCls, balSign, statusCls, statusText;
    if (abs < 0.5) {
      balCls     = 'text-even';
      balSign    = '';
      statusCls  = 'balance-status--even';
      statusText = '✓ In pari';
    } else if (b.balance > 0) {
      balCls     = 'text-positive';
      balSign    = '+';
      statusCls  = 'balance-status--positive';
      statusText = 'creditore';
    } else {
      balCls     = 'text-negative';
      balSign    = '−';
      statusCls  = 'balance-status--negative';
      statusText = 'debitore';
    }

    return `
      <div class="balance-pill balance-pill--tap" data-pid="${b.participant.id}">
        ${participantAvatar(b.participant)}
        <div class="balance-pill__info">
          <span class="balance-pill__name">${b.participant.name}</span>
          <div class="balance-pill__amounts">
            <span class="amt-tag amt-tag--paid" title="Anticipato">↑ ${fmt(advanced)}</span>
            <span class="amt-tag amt-tag--cons" title="Consumato">↓ ${fmt(consumed)}</span>
          </div>
        </div>
        <div class="balance-pill__right">
          <span class="balance-pill__net ${balCls}">
            ${abs < 0.5 ? '✓' : balSign + fmt(abs)}
          </span>
          <span class="balance-status ${statusCls}" style="font-size:11px">${statusText}</span>
        </div>
        <span class="balance-pill__chevron">›</span>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <h3 class="section-title" style="margin-bottom:14px">Riepilogo</h3>
      ${rows}
    </div>`;
}

// ── Settlements ───────────────────────────────────────
function _renderSettlements(suggested, gifts, confirmed) {
  const trip = State.currentTrip;

  if (!suggested.length && !gifts.length && !confirmed.length) {
    return `
      <div class="card zero-state-card">
        <p class="zero-state__emoji">🎉</p>
        <h3 class="zero-state__title">Tutti in pari!</h3>
        <p class="zero-state__sub">Nessun pagamento necessario.<br>Il viaggio è chiuso.</p>
      </div>`;
  }

  return `
    ${suggested.length ? _renderSuggestedList(suggested) : (confirmed.length || gifts.length ? _renderAllPaidBanner() : '')}
    ${gifts.length ? _renderGiftList(gifts) : ''}
    ${confirmed.length ? _renderConfirmedList(confirmed, trip) : ''}
  `;
}

function _renderSuggestedList(suggested) {
  const trip = State.currentTrip;
  const cur  = trip?.currency ?? '€';
  const cards = suggested.map(s => {
    const suggestedEuro = (s.amountCents / 100).toFixed(2);
    return `
    <div class="settlement-card">
      <div class="settlement-card__parties">
        <div class="settlement-card__person">
          ${participantAvatar(s.from, 'avatar--lg')}
          <span class="settlement-card__name">${s.from.name}</span>
        </div>
        <span class="settlement-card__arrow">→</span>
        <div class="settlement-card__person">
          ${participantAvatar(s.to, 'avatar--lg')}
          <span class="settlement-card__name">${s.to.name}</span>
        </div>
      </div>
      <div class="settlement-card__amount-row">
        <span class="settlement-card__currency">${cur}</span>
        <input class="settlement-card__amount-input"
               type="number" inputmode="decimal"
               value="${suggestedEuro}"
               min="0.01" step="0.01"
               data-suggested="${suggestedEuro}" />
        <span class="settlement-card__suggested-label">suggerito</span>
      </div>
      <button class="settlement-card__cta"
              data-confirm-settlement
              data-from="${s.from.id}"
              data-to="${s.to.id}">
        Segna come pagato
      </button>
    </div>`;
  }).join('');

  return `
    <div class="settlements-section">
      <div class="section-header" style="padding:0 0 10px">
        <h3 class="section-title">Da saldare</h3>
        <span class="section-sub">${suggested.length} ${suggested.length === 1 ? 'pagamento' : 'pagamenti'}</span>
      </div>
      ${cards}
    </div>`;
}

function _renderAllPaidBanner() {
  return `
    <div class="card" style="text-align:center; padding: 20px">
      <p style="font-size:24px; margin-bottom:6px">✅</p>
      <p style="font-weight:600; color: var(--color-primary-dark)">Tutti i pagamenti confermati</p>
    </div>`;
}

// ── Offerte (facoltative) ─────────────────────────────
function _renderGiftList(gifts) {
  const trip = State.currentTrip;
  const cur  = trip?.currency ?? '€';

  const cards = gifts.map(g => {
    const euro = (g.amountCents / 100).toFixed(2);
    return `
      <div class="settlement-card settlement-card--gift">
        <div class="gift-card__badge">🎁 Offerta — nessun obbligo</div>
        <div class="settlement-card__parties">
          <div class="settlement-card__person">
            ${participantAvatar(g.from, 'avatar--lg')}
            <span class="settlement-card__name">${g.from.name}</span>
          </div>
          <span class="settlement-card__arrow">→</span>
          <div class="settlement-card__person">
            ${participantAvatar(g.to, 'avatar--lg')}
            <span class="settlement-card__name">${g.to.name}</span>
          </div>
        </div>
        <div class="settlement-card__amount-row">
          <span class="settlement-card__currency">${cur}</span>
          <input class="settlement-card__amount-input"
                 type="number" inputmode="decimal"
                 value="${euro}" min="0.01" step="0.01"
                 data-suggested="${euro}" />
          <span class="settlement-card__suggested-label">facoltativo</span>
        </div>
        <button class="settlement-card__cta settlement-card__cta--ghost"
                data-confirm-settlement
                data-from="${g.from.id}"
                data-to="${g.to.id}">
          Sdebitarsi 💛
        </button>
      </div>`;
  }).join('');

  return `
    <div class="settlements-section">
      <div class="section-header" style="padding:0 0 10px">
        <h3 class="section-title">🎁 Offerte ricevute</h3>
        <span class="section-sub">facoltative</span>
      </div>
      ${cards}
    </div>`;
}

// ── CSV Export ────────────────────────────────────────
function _buildCSV(trip) {
  const expenses = State.expenses.filter(isGroupExpense);
  const cur      = trip.currency ?? '€';
  const pName    = id => trip.participants.find(p => p.id === id)?.name ?? '?';
  const esc      = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const header = ['Data','Titolo','Categoria','Importo','Valuta','Pagante/i','Consumatori'];
  const rows   = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const amt     = (readAmount(e) / 100).toFixed(2);
      const payers  = readPayers(e).map(p => pName(p.participantId)).join('; ');
      const consumers = (e.consumers ?? []).map(c => `${pName(c.participantId)}(${c.shares}q)`).join('; ');
      return [e.date, e.title, e.category, amt, cur, payers, consumers].map(esc).join(',');
    });

  return [header.map(esc).join(','), ...rows].join('\r\n');
}

// ── Report per partecipante ───────────────────────────
function _openParticipantSheet(participantId, trip) {
  const p        = trip.participants.find(x => x.id === participantId);
  if (!p) return;

  const expenses = State.expenses.filter(isGroupExpense);
  const cur      = trip.currency ?? '€';
  const fmt      = cents => Selectors.formatCurrency(cents, cur);
  const pName    = id   => trip.participants.find(x => x.id === id)?.name ?? '?';

  // Spese dove è consumer
  const asConsumer = expenses.filter(e =>
    (e.consumers ?? []).some(c => c.participantId === participantId)
  );
  // Spese dove è payer
  const asPayer = expenses.filter(e =>
    (e.payers ?? []).some(pp => pp.participantId === participantId)
  );

  // Calcola quanto ha consumato e quanto ha anticipato
  const { advanced, consumed } = _participantStats(participantId, expenses);

  const balance = Math.round(advanced - consumed);
  const balCls  = Math.abs(balance) < 1 ? 'even' : balance > 0 ? 'text-positive' : 'text-negative';
  const balTxt  = Math.abs(balance) < 1
    ? '✓ In pari'
    : balance > 0
      ? `Creditore di ${fmt(Math.abs(balance))}`
      : `Debitore di ${fmt(Math.abs(balance))}`;

  const CAT_ICON = { alloggio:'🏠', trasporti:'🚗', noleggi:'⛵', cibo:'🍝', spesa:'🛒', attivita:'🎭', servizi:'🔧', altro:'📋' };

  const expRows = (list, role) => list.length
    ? list.map(e => {
        let myAmt = 0;
        if (role === 'consumer') {
          const tot = (e.consumers ?? []).reduce((s, c) => s + (c.shares ?? 0), 0);
          const my  = (e.consumers ?? []).find(c => c.participantId === participantId)?.shares ?? 0;
          if (tot > 0) myAmt = readAmount(e) * my / tot;
        } else {
          const tot = (e.payers ?? []).reduce((s, pp) => s + (pp.sharesPaid ?? 0), 0);
          const my  = (e.payers ?? []).find(pp => pp.participantId === participantId)?.sharesPaid ?? 0;
          if (tot > 0) myAmt = readAmount(e) * my / tot;
        }
        return `
          <div class="sheet-exp-row">
            <span class="sheet-exp-icon">${CAT_ICON[e.category] ?? '📋'}</span>
            <div class="sheet-exp-body">
              <span class="sheet-exp-title">${e.title}</span>
              <span class="sheet-exp-date">${e.date}</span>
            </div>
            <span class="sheet-exp-amt ${role === 'consumer' ? 'text-negative' : 'text-positive'}">
              ${role === 'consumer' ? '−' : '+'}${fmt(Math.round(myAmt))}
            </span>
          </div>`;
      }).join('')
    : `<p class="sheet-empty">Nessuna spesa</p>`;

  // Settlements che riguardano questo partecipante
  const mySettlements = State.settlements.filter(
    s => s.fromParticipantId === participantId || s.toParticipantId === participantId
  );
  const settleRows = mySettlements.map(s => {
    const isFrom = s.fromParticipantId === participantId;
    return `
      <div class="sheet-exp-row">
        <span class="sheet-exp-icon">💸</span>
        <div class="sheet-exp-body">
          <span class="sheet-exp-title">
            ${isFrom ? `Ha pagato ${pName(s.toParticipantId)}` : `Ricevuto da ${pName(s.fromParticipantId)}`}
          </span>
          <span class="sheet-exp-date">${s.date ?? ''}</span>
        </div>
        <span class="sheet-exp-amt ${isFrom ? 'text-positive' : 'text-negative'}">
          ${isFrom ? '+' : '−'}${fmt(s.amountCents)}
        </span>
      </div>`;
  }).join('');

  const html = `
    <div id="participant-sheet-backdrop" class="sheet-backdrop">
      <div id="participant-sheet" class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          ${participantAvatar(p, 'avatar--lg')}
          <div>
            <h3 class="sheet-name">${p.name}</h3>
            <span class="balance-status ${balCls}" style="font-size:14px">${balTxt}</span>
          </div>
          <button id="btn-sheet-close" class="sheet-close">✕</button>
        </div>

        <div class="sheet-stats">
          <div class="sheet-stat">
            <span class="sheet-stat__val text-negative">−${fmt(Math.round(consumed))}</span>
            <span class="sheet-stat__lbl">Consumato</span>
          </div>
          <div class="sheet-stat">
            <span class="sheet-stat__val text-positive">+${fmt(Math.round(advanced))}</span>
            <span class="sheet-stat__lbl">Anticipato</span>
          </div>
        </div>

        <div class="sheet-scroll">
          ${asPayer.length ? `
            <h4 class="sheet-section-title">💳 Ha anticipato (${asPayer.length})</h4>
            ${expRows(asPayer, 'payer')}` : ''}

          ${asConsumer.length ? `
            <h4 class="sheet-section-title">🧾 Ha consumato (${asConsumer.length})</h4>
            ${expRows(asConsumer, 'consumer')}` : ''}

          ${mySettlements.length ? `
            <h4 class="sheet-section-title">💸 Pagamenti (${mySettlements.length})</h4>
            ${settleRows}` : ''}
        </div>
      </div>
    </div>`;

  // Rimuovi eventuale sheet aperto precedente
  document.getElementById('participant-sheet')?.remove();
  document.getElementById('participant-sheet-backdrop')?.remove();
  document.getElementById('screen-balances').insertAdjacentHTML('beforeend', html);

  // Animazione ingresso
  requestAnimationFrame(() => {
    document.getElementById('participant-sheet')?.classList.add('sheet--open');
  });
}

// ── HTML statico condivisibile ────────────────────────
function _buildStaticHTML(trip) {
  const expenses    = State.expenses.filter(isGroupExpense);
  const balances    = Selectors.balances();
  const suggested   = Selectors.suggestedSettlements();
  const confirmed   = State.settlements;
  const total       = Selectors.tripTotal();
  const cur         = trip.currency ?? '€';

  const fmt = (cents) => {
    return ((cents ?? 0) / 100).toLocaleString('it-IT', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + cur;
  };
  const fDate = (iso) => new Date(iso + 'T00:00:00')
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const pName = (id) => trip.participants.find(p => p.id === id)?.name ?? '?';

  const CAT_ICON = {
    alloggio:'🏠', trasporti:'🚗', noleggi:'⛵', cibo:'🍝',
    spesa:'🛒', attivita:'🎭', servizi:'🔧', altro:'📋',
  };

  // Spese raggruppate per data
  const byDate = {};
  [...expenses].sort((a,b) => b.date.localeCompare(a.date)).forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });

  const expenseRows = Object.entries(byDate).map(([date, exps]) => {
    const dayTotal = exps.reduce((s,e) => s + readAmount(e), 0);
    const rows = exps.map(e => {
      const payerNames = readPayers(e)
        .map(p => pName(p.participantId)).join(', ');
      return `<tr>
        <td>${CAT_ICON[e.category] ?? '📋'} ${e.title}</td>
        <td>${payerNames}</td>
        <td class="amt">${fmt(readAmount(e))}</td>
      </tr>`;
    }).join('');
    return `
      <tr class="date-row"><td colspan="3">
        📅 ${fDate(date)} <span class="day-total">${fmt(dayTotal)}</span>
      </td></tr>
      ${rows}`;
  }).join('');

  const balanceRows = balances.map(b => {
    const abs = Math.abs(b.balance);
    const cls = abs < 1 ? 'even' : b.balance > 0 ? 'pos' : 'neg';
    const txt = abs < 1 ? 'In pari ✓'
      : b.balance > 0   ? `Creditore di ${fmt(abs)}`
                        : `Debitore di ${fmt(abs)}`;
    return `<tr><td>${b.participant.name}</td><td class="${cls}">${txt}</td></tr>`;
  }).join('');

  const settlementRows = suggested.length
    ? suggested.map(s =>
        `<tr><td>${s.from.name}</td><td>→</td><td>${s.to.name}</td><td class="amt">${fmt(s.amountCents)}</td></tr>`
      ).join('')
    : `<tr><td colspan="4" class="even">✓ Nessun pagamento necessario</td></tr>`;

  const confirmedRows = confirmed.map(s =>
    `<tr>
       <td>${pName(s.fromParticipantId)} → ${pName(s.toParticipantId)}</td>
       <td class="amt">${fmt(s.amountCents)}</td>
       <td><span class="badge-ok">Pagato</span></td>
     </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Cambusa — ${trip.name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,sans-serif;background:#f5f5f4;color:#1c1917;padding:16px;max-width:680px;margin:0 auto}
    h1{font-size:22px;font-weight:800;margin-bottom:4px}
    .sub{color:#78716c;font-size:13px;margin-bottom:20px}
    .card{background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
    h2{font-size:15px;font-weight:700;margin-bottom:12px;color:#1c1917}
    table{width:100%;border-collapse:collapse;font-size:14px}
    td{padding:8px 6px;border-bottom:1px solid #f5f5f4;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .amt{text-align:right;font-weight:600;white-space:nowrap}
    .date-row td{background:#f5f5f4;font-weight:700;font-size:13px;color:#78716c;padding:6px 6px}
    .day-total{float:right;color:#10b981}
    .pos{color:#059669;font-weight:600}
    .neg{color:#ef4444;font-weight:600}
    .even{color:#78716c}
    .badge-ok{background:#ecfdf5;color:#059669;border-radius:20px;padding:2px 8px;font-size:12px;font-weight:600}
    .total-box{background:#10b981;color:#fff;border-radius:16px;padding:16px;margin-bottom:12px;text-align:center}
    .total-box .big{font-size:32px;font-weight:800;display:block}
    .total-box .label{font-size:13px;opacity:.85}
    footer{text-align:center;color:#a8a29e;font-size:12px;margin-top:20px}
  </style>
</head>
<body>
  <h1>${trip.name}</h1>
  <p class="sub">📍 ${trip.location} · ${fDate(trip.startDate)} – ${fDate(trip.endDate)}</p>

  <div class="total-box">
    <span class="big">${fmt(total)}</span>
    <span class="label">${expenses.length} spese · ${trip.participants.length} partecipanti</span>
  </div>

  <div class="card">
    <h2>Saldi</h2>
    <table><tbody>${balanceRows}</tbody></table>
  </div>

  <div class="card">
    <h2>Da saldare</h2>
    <table><tbody>${settlementRows}</tbody></table>
  </div>

  ${confirmedRows ? `<div class="card">
    <h2>Pagamenti confermati</h2>
    <table><tbody>${confirmedRows}</tbody></table>
  </div>` : ''}

  <div class="card">
    <h2>Spese</h2>
    <table><tbody>${expenseRows}</tbody></table>
  </div>

  <footer>Generato da Cambusa · ${new Date().toLocaleDateString('it-IT')}</footer>
</body>
</html>`;
}

function _downloadText(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Export PDF ────────────────────────────────────────
async function _exportPDF(trip) {
  // Carica jsPDF + autotable dal CDN (lazy, solo quando serve)
  await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

  const { jsPDF } = window.jspdf;
  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const expenses    = State.expenses.filter(isGroupExpense);
  const balances    = Selectors.balances();
  const settlements = Selectors.suggestedSettlements();
  const confirmed   = State.settlements;
  const total       = Selectors.tripTotal();

  const fDate  = d => new Date(d + 'T00:00:00')
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const fShort = d => new Date(d + 'T00:00:00')
    .toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });

  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin + 4;

  // ── Header ──────────────────────────────────────────
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageW, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(trip.name, margin, 10);

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text(
    `${trip.location}  ·  ${fDate(trip.startDate)} – ${fDate(trip.endDate)}  ·  ${trip.participants.length} partecipanti`,
    margin, 17
  );

  y = 30;
  doc.setTextColor(0, 0, 0);

  // ── Riepilogo statistiche ────────────────────────────
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Riepilogo', margin, y);
  y += 3;

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Totale viaggio', 'Spese', 'Partecipanti']],
    body: [[
      Selectors.formatCurrency(total),
      String(expenses.length),
      String(trip.participants.length),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 11, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Saldi ────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Saldi', margin, y);
  y += 3;

  const balanceRows = balances.map(b => {
    const abs = Math.abs(b.balance);
    const label = abs < 1
      ? 'In pari'
      : b.balance > 0 ? `+ ${Selectors.formatCurrency(abs)}`
                      : `− ${Selectors.formatCurrency(abs)}`;
    return [b.participant.name, label];
  });

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Partecipante', 'Saldo netto']],
    body: balanceRows,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], fontSize: 9 },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        const v = data.cell.raw ?? '';
        if (v.startsWith('+'))      data.cell.styles.textColor = [16, 185, 129];
        else if (v.startsWith('−')) data.cell.styles.textColor = [239, 68, 68];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── Pagamenti da effettuare ───────────────────────────
  const pending = settlements.filter(s =>
    !confirmed.some(c => c.fromParticipantId === s.from.id && c.toParticipantId === s.to.id)
  );

  if (pending.length) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Da saldare', margin, y);
    y += 3;

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Da', 'A', 'Importo']],
      body: pending.map(s => [s.from.name, s.to.name, Selectors.formatCurrency(s.amountCents)]),
      theme: 'striped',
      headStyles: { fillColor: [234, 179, 8], fontSize: 9, textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Lista spese ──────────────────────────────────────
  if (y > 220) { doc.addPage(); y = margin; }

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('Spese', margin, y);
  y += 3;

  const CAT_LABEL = {
    alloggio: 'Alloggio', trasporti: 'Trasporti', noleggi: 'Noleggi',
    cibo: 'Cibo', spesa: 'Spesa', attivita: 'Attivita', servizi: 'Servizi', altro: 'Altro',
  };

  const expRows = Selectors.expensesSortedByDate()
    .filter(isGroupExpense)
    .map(e => {
      const payerNames = (e.payers ?? [])
        .map(p => trip.participants.find(x => x.id === p.participantId)?.name ?? '—')
        .join(', ');
      return [
        fShort(e.date),
        e.title,
        CAT_LABEL[e.category] ?? 'Altro',
        payerNames,
        Selectors.formatCurrency(readAmount(e)),
      ];
    });

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo']],
    body: expRows,
    theme: 'striped',
    headStyles: { fillColor: [107, 114, 128], fontSize: 9 },
    styles: { fontSize: 9, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 14 },
      2: { cellWidth: 22 },
      4: { cellWidth: 22, halign: 'right' },
    },
  });

  // ── Pagine footer ────────────────────────────────────
  const nPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= nPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160);
    const today = new Date().toLocaleDateString('it-IT');
    doc.text(`Generato da Cambusa · ${today}`, margin, 291);
    doc.text(`${i} / ${nPages}`, pageW - margin, 291, { align: 'right' });
    doc.setTextColor(0);
  }

  const slug = trip.name.replace(/\s+/g, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  doc.save(`cambusa-${slug}-${date}.pdf`);
  Toast.show('📄 PDF generato e scaricato', { type: 'success' });
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Script load failed: ${src}`));
    document.head.appendChild(s);
  });
}

// ── Condivisione file HTML (Web Share API o download) ─
async function _shareHTMLFile(trip) {
  const html     = _buildStaticHTML(trip);
  const slug     = trip.name.replace(/\s+/g, '-').toLowerCase();
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `cambusa-${slug}-${date}.html`;
  const file     = new File([html], filename, { type: 'text/html' });

  // Web Share API con file — iOS 15+, Android Chrome 89+
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: trip.name,
        text:  `Riepilogo viaggio — ${trip.name}`,
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // Utente ha annullato
      // Altro errore → fallthrough verso download
    }
  }

  // Fallback: scarica il file
  _downloadText(html, filename, 'text/html');
  Toast.show('📄 Riepilogo HTML scaricato');
}

function _renderConfirmedList(confirmed, trip) {
  const rows = confirmed.map(s => {
    const from = trip.participants.find(p => p.id === s.fromParticipantId);
    const to   = trip.participants.find(p => p.id === s.toParticipantId);
    return `
      <div class="confirmed-row">
        ${participantAvatar(from ?? { name: '?', color: '#ccc' }, 'avatar--sm')}
        <span class="confirmed-row__text">
          <strong>${from?.name ?? '?'}</strong>
          <span class="confirmed-row__arrow"> → </span>
          <strong>${to?.name ?? '?'}</strong>
        </span>
        <span class="confirmed-row__amount">${Selectors.formatCurrency(s.amountCents)}</span>
        <span class="confirmed-badge">Pagato</span>
        <button class="confirmed-undo" data-delete-settlement="${s.id}"
                aria-label="Annulla">×</button>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="section-header" style="margin-bottom:10px">
        <h3 class="section-title">Già pagati</h3>
        <span class="badge badge--green">✓ ${confirmed.length}</span>
      </div>
      ${rows}
    </div>`;
}
