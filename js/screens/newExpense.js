/* =====================================================
   CAMBUSA — newExpense.js  (Ledger V3)
   Form spesa mobile-first.

   SCHEMA V3
   ─────────────────────────────────────────────────────
   consumers[] — chi beneficia della spesa (shares)
   payers[]    — chi ha anticipato (sharesPaid)

   SEZIONI FORM
   ─────────────────────────────────────────────────────
   ① Importo
   ② Titolo + Data
   ③ Categoria
   ④ Chi consuma?   (consumers + shares)
   ⑤ Chi ha pagato? (payers + sharesPaid)
   ⑥ Note
   ===================================================== */

import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Topbar }    from '../ui.js';
import { Toast }     from '../toast.js';
import { Modal }     from '../ui/modal.js';
import { readAmount } from '../domain/guards.js';
import { Selectors } from '../selectors.js';
import { participantAvatar } from '../components/avatar.js';
import { OCR }        from '../ocr.js';
import { parseReceipt } from '../domain/ocrParser.js';
import { maybeAutoBackup } from '../autoBackup.js';

const CATEGORIES = [
  { id: 'cibo',      icon: '🍝', label: 'Cibo'      },
  { id: 'spesa',     icon: '🛒', label: 'Spesa'     },
  { id: 'trasporti', icon: '🚕', label: 'Trasporti' },
  { id: 'alloggio',  icon: '🏠', label: 'Alloggio'  },
  { id: 'attivita',  icon: '🏖', label: 'Attività'  },
  { id: 'noleggi',   icon: '⛵', label: 'Noleggi'   },
  { id: 'servizi',   icon: '🔧', label: 'Servizi'   },
  { id: 'altro',     icon: '📦', label: 'Altro'     },
];

// ── Stato modulo ──────────────────────────────────────
let _form          = null;
let _initialized   = false;
let _editExpenseId = null;

function _emptyForm(trip) {
  const sharesMap = {};
  trip.participants.forEach(p => { sharesMap[p.id] = 1; });

  const payerSharesMap = {};
  const firstPid = trip.participants[0]?.id ?? null;
  if (firstPid) payerSharesMap[firstPid] = 1;

  return {
    title:           '',
    amount:          '',
    category:        'cibo',
    date:            _today(),
    notes:           '',
    // Consumers
    consumerPreset:      'tutti',   // 'tutti' | 'presenti' | 'custom'
    consumerMode:        'shares',  // 'equal' | 'shares' | 'amounts' | 'percent'
    consumerPids:        trip.participants.map(p => p.id),
    sharesMap,
    consumerAmountsMap:  {},        // { pid: euroAmount } — usato solo in mode 'amounts'
    consumerPercentMap:  {},        // { pid: number 0-100 } — usato solo in mode 'percent'
    // Payers
    payerPids:        firstPid ? [firstPid] : [],
    payerSharesMap,
    payerMode:        'shares',   // 'shares' | 'amounts' | 'guests'
    payerAmountsMap:  {},         // { pid: euroAmount }
    payerPaidMap:     {},         // { pid: bool } — true = già versato, false = da versare
    guestMap:         {},         // { pid: bool } — true = ospite (non paga)
    guestPayerMap:    {},         // { guestPid: payerPid[] } — chi paga per l'ospite (multi)
    giftMap:          {},         // { pid: bool } — true = ospite riceve offerta (no debito)
    // Transport date sync (solo categoria 'trasporti')
    transportSync:   false,
    transportType:   'andata',   // 'andata' | 'ritorno'
    transportDate:   null,       // null = usa la data della spesa
  };
}

// ── Screen ────────────────────────────────────────────
export const NewExpenseScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Apri un viaggio prima.</p>';

    if (!_initialized) {
      const expId = State.params?.expenseId ?? null;
      if (expId) {
        const existing = State.expenses.find(e => e.id === expId);
        _form          = existing ? _formFromExpense(existing, trip) : _emptyForm(trip);
        _editExpenseId = existing ? expId : null;
      } else {
        _form          = _emptyForm(trip);
        _editExpenseId = null;
      }
      _initialized = true;
    }

    const isEdit = !!_editExpenseId;

    return `
      <div class="screen" id="screen-new-expense">
        ${Topbar({ title: isEdit ? 'Modifica spesa' : 'Nuova spesa', back: true })}

        <main class="screen-content">

          <!-- ① Importo -->
          <div class="card amount-card">
            <div class="amount-wrap">
              <span class="amount-currency">${trip.currency}</span>
              <input id="f-amount" class="amount-input" type="number"
                     inputmode="decimal" placeholder="0.00"
                     value="${_form.amount}" autocomplete="off" />
            </div>
          </div>

          <!-- ② Titolo + Data -->
          <div class="card title-date-card">
            <input id="f-title" class="input title-input" type="text"
                   placeholder="Descrizione spesa…" value="${_form.title}" />
            <input id="f-date" class="input date-inline" type="date"
                   value="${_form.date}" />
          </div>

          <!-- ③ Categoria -->
          <div class="card">
            <label class="field-label">Categoria</label>
            <div class="category-grid" id="cat-grid">
              ${CATEGORIES.map(c => `
                <button class="category-chip ${_form.category === c.id ? 'category-chip--active' : ''}"
                        data-cat="${c.id}">
                  <span>${c.icon}</span>
                  <span>${c.label}</span>
                </button>`).join('')}
            </div>
          </div>

          <!-- ④ Chi consuma? -->
          <div class="card" id="card-consumers">
            ${_renderConsumers(trip)}
          </div>

          <!-- ⑤ Chi ha pagato? -->
          <div class="card" id="card-payers">
            ${_renderPayers(trip)}
          </div>

          <!-- ⑥ Trasporto di viaggio (solo categoria trasporti) -->
          <div class="card" id="card-transport"
               style="${_form.category !== 'trasporti' ? 'display:none' : ''}">
            ${_renderTransport()}
          </div>

          <!-- ⑦ Note -->
          <div class="card">
            <details id="notes-section">
              <summary class="presence-summary">+ Note</summary>
              <div style="padding-top:8px">
                <textarea id="f-notes" class="input textarea-notes"
                          placeholder="Note opzionali…"
                          rows="3">${_form.notes}</textarea>
              </div>
            </details>
          </div>

          <!-- Allegato placeholder -->
          <!-- OCR scontrino -->
          <div id="ocr-area">
            <label class="attach-btn" id="btn-attach">
              📷 Scansiona scontrino
              <input type="file" id="input-receipt"
                     accept="image/*" capture="environment"
                     style="display:none" />
            </label>
            <div id="ocr-result" style="display:none"></div>
          </div>

          <button class="save-btn" id="btn-save">
            ${isEdit ? 'Salva modifiche' : 'Salva spesa'}
          </button>

        </main>
      </div>`;
  },

  mount() {
    const trip = State.currentTrip;

    // Back
    document.querySelector('#screen-new-expense .btn-back')
      ?.addEventListener('click', () => {
        const wasEdit = !!_editExpenseId;
        _reset();
        if (wasEdit) {
          Router.go('expenses', { tripId: trip?.id });
        } else {
          Router.go(trip ? 'trip' : 'home', trip ? { tripId: trip.id } : {});
        }
      });

    setTimeout(() => document.getElementById('f-amount')?.focus(), 100);

    // Importo
    const amtInput = document.getElementById('f-amount');
    amtInput?.addEventListener('input', e => {
      _form.amount = e.target.value;
      _refreshConsumerSummary();
      _refreshPayerSummary(trip);
    });
    // iOS: quando la tastiera si chiude, riporta la pagina in cima
    amtInput?.addEventListener('blur', () => {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 80);
    });

    // Data
    document.getElementById('f-date')
      ?.addEventListener('change', e => {
        _form.date = e.target.value;
        if (_form.consumerPreset === 'presenti') _applyConsumerPreset('presenti', trip);
      });

    // Categoria
    document.getElementById('cat-grid')
      ?.addEventListener('click', e => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        _form.category = btn.dataset.cat;
        document.querySelectorAll('[data-cat]')
          .forEach(b => b.classList.remove('category-chip--active'));
        btn.classList.add('category-chip--active');
        // Mostra/nascondi sezione trasporto
        const transportCard = document.getElementById('card-transport');
        if (transportCard) {
          transportCard.style.display = _form.category === 'trasporti' ? '' : 'none';
          if (_form.category !== 'trasporti') _form.transportSync = false;
        }
      });

    // Consumers events
    _bindConsumerEvents(trip);

    // Payers events
    _bindPayerEvents(trip);

    // Transport events
    _bindTransportEvents();

    // Note
    document.getElementById('f-notes')
      ?.addEventListener('input', e => { _form.notes = e.target.value; });

    // OCR scontrino
    document.getElementById('input-receipt')
      ?.addEventListener('change', e => _handleOCR(e, trip));

    // Salva
    document.getElementById('btn-save')
      ?.addEventListener('click', () => _handleSave(trip));
  },

  unmount() { _reset(); },
};

// ── Render sezione consumers ──────────────────────────
function _renderConsumers(trip) {
  const amount      = parseFloat(_form.amount) || 0;
  const mode        = _form.consumerMode;
  const isShares    = mode === 'shares';
  const isAmounts   = mode === 'amounts';
  const isPercent   = mode === 'percent';
  const totalShares = _calcConsumerShares();

  // Summary dinamico per modalità
  let summaryHtml;
  if (isAmounts) {
    const { text, cls } = _consumerBalanceInfo(trip);
    summaryHtml = `<span class="section-sub ${cls}" id="consumer-summary">${text}</span>`;
  } else if (isPercent) {
    const { text, cls } = _consumerPercentInfo();
    summaryHtml = `<span class="section-sub ${cls}" id="consumer-summary">${text}</span>`;
  } else {
    const perUnit = totalShares > 0 && amount
      ? ` · ${(amount / totalShares).toFixed(2)}${trip.currency}/${isShares ? 'q' : 'pers.'}`
      : '';
    summaryHtml = `<span class="section-sub" id="consumer-summary">${_form.consumerPids.length} partecipanti${perUnit}</span>`;
  }

  return `
    <div class="section-header">
      <label class="field-label" style="margin:0">Chi consuma</label>
      ${summaryHtml}
    </div>

    <div class="split-presets" id="consumer-presets">
      ${['tutti','presenti','custom'].map(p => `
        <button class="filter-chip ${_form.consumerPreset === p ? 'filter-chip--active' : ''}"
                data-cpreset="${p}">
          ${p === 'tutti' ? 'Tutti' : p === 'presenti' ? '📅 Presenti' : '✏ Custom'}
        </button>`).join('')}
      ${(trip.groups ?? []).map(g => `
        <button class="filter-chip filter-chip--group ${_form.consumerPreset === 'g:' + g.id ? 'filter-chip--active' : ''}"
                data-cpreset="g:${g.id}">
          👥 ${g.name}
        </button>`).join('')}
      ${(trip.splitPresets ?? []).map(sp => `
        <button class="filter-chip filter-chip--preset ${_form.consumerPreset === 'sp:' + sp.id ? 'filter-chip--active' : ''}"
                data-cpreset="sp:${sp.id}">
          ⭐ ${sp.name}
        </button>`).join('')}
      <button class="filter-chip split-save-btn" data-action="save-split-preset" title="Salva questa selezione come preset">
        + Salva
      </button>
    </div>

    <div class="split-mode-toggle" id="consumer-mode">
      <button class="split-mode-btn ${mode === 'equal'   ? 'split-mode-btn--active' : ''}"
              data-cmode="equal">= Uguale</button>
      <button class="split-mode-btn ${mode === 'shares'  ? 'split-mode-btn--active' : ''}"
              data-cmode="shares">⚖ Quote</button>
      <button class="split-mode-btn ${mode === 'percent' ? 'split-mode-btn--active' : ''}"
              data-cmode="percent">% Perc.</button>
      <button class="split-mode-btn ${mode === 'amounts' ? 'split-mode-btn--active' : ''}"
              data-cmode="amounts">✏ Importo</button>
    </div>

    <div id="consumer-rows">
      ${trip.participants.map(p => _renderConsumerRow(p, trip)).join('')}
    </div>`;
}

function _renderConsumerRow(p, trip) {
  const isSelected = _form.consumerPids.includes(p.id);
  const isCustom   = _form.consumerPreset === 'custom';
  const mode       = _form.consumerMode;
  const isShares   = mode === 'shares';
  const isAmounts  = mode === 'amounts';
  const isPercent  = mode === 'percent';
  const shares     = _form.sharesMap[p.id] ?? 1;

  // Modalità percentuale
  if (isPercent) {
    const pctVal = isSelected && _form.consumerPercentMap[p.id] != null
      ? _form.consumerPercentMap[p.id]
      : '';
    return `
      <div class="split-row ${!isSelected ? 'split-row--off' : ''}">
        <button class="split-toggle ${isSelected ? 'split-toggle--on' : ''}"
                data-ctoggle="${p.id}" ${!isCustom ? 'disabled' : ''}>
          ${participantAvatar(p, 'avatar--sm')}
          <span class="split-row__name">${p.name}</span>
          ${isSelected ? '<span class="split-check">✓</span>' : ''}
        </button>
        ${isSelected ? `
          <div class="payer-amt-wrap">
            <input class="payer-amt-input" type="number" inputmode="decimal"
                   data-cpct="${p.id}" placeholder="0"
                   value="${pctVal}" min="0" max="100" step="0.1" />
            <span class="payer-amt-currency">%</span>
          </div>` : ''}
      </div>`;
  }

  // Modalità importo esatto
  if (isAmounts) {
    const amtVal = isSelected && _form.consumerAmountsMap[p.id] != null
      ? _form.consumerAmountsMap[p.id]
      : '';
    return `
      <div class="split-row ${!isSelected ? 'split-row--off' : ''}">
        <button class="split-toggle ${isSelected ? 'split-toggle--on' : ''}"
                data-ctoggle="${p.id}" ${!isCustom ? 'disabled' : ''}>
          ${participantAvatar(p, 'avatar--sm')}
          <span class="split-row__name">${p.name}</span>
          ${isSelected ? '<span class="split-check">✓</span>' : ''}
        </button>
        ${isSelected ? `
          <div class="payer-amt-wrap">
            <span class="payer-amt-currency">${trip?.currency ?? '€'}</span>
            <input class="payer-amt-input" type="number" inputmode="decimal"
                   data-camt="${p.id}" placeholder="0.00"
                   value="${amtVal}" min="0" step="0.01" />
          </div>` : ''}
      </div>`;
  }

  // Modalità quote / uguale
  let rightContent = '';
  if (isSelected && isShares) {
    rightContent = `
      <div class="split-row__controls">
        <button class="split-btn" data-cdelta="-1" data-cpid="${p.id}">−</button>
        <span class="split-qty" id="csq-${p.id}">${shares}</span>
        <button class="split-btn" data-cdelta="1"  data-cpid="${p.id}">+</button>
      </div>`;
  } else if (isSelected) {
    rightContent = `<span class="split-qty-label">${shares}q</span>`;
  }

  return `
    <div class="split-row ${!isSelected ? 'split-row--off' : ''}">
      <button class="split-toggle ${isSelected ? 'split-toggle--on' : ''}"
              data-ctoggle="${p.id}" ${!isCustom ? 'disabled' : ''}>
        ${participantAvatar(p, 'avatar--sm')}
        <span class="split-row__name">${p.name}</span>
        ${isSelected ? '<span class="split-check">✓</span>' : ''}
      </button>
      ${rightContent}
    </div>`;
}

// ── Render sezione payers ─────────────────────────────
function _renderPayers(trip) {
  const multiPayer  = _form.payerPids.length > 1;
  const payerMode   = _form.payerMode;

  // Summary
  let summaryHtml = '';
  if (payerMode === 'amounts') {
    const { text, cls } = _payerBalanceInfo(trip);
    summaryHtml = `<span class="section-sub ${cls}" id="payer-summary">${text}</span>`;
  } else if (payerMode === 'guests') {
    const nGuests = Object.values(_form.guestMap).filter(Boolean).length;
    if (nGuests) summaryHtml = `<span class="section-sub" id="payer-summary">${nGuests} ospite/i</span>`;
  } else if (multiPayer) {
    summaryHtml = `<span class="section-sub" id="payer-summary">${_form.payerPids.length} paganti</span>`;
  }

  return `
    <div class="section-header">
      <label class="field-label" style="margin:0">Chi ha pagato</label>
      ${summaryHtml}
    </div>

    <div class="split-mode-toggle" id="payer-mode" style="margin-bottom:10px">
      <button class="split-mode-btn ${payerMode === 'shares'  ? 'split-mode-btn--active' : ''}"
              data-pmode="shares">Per quote</button>
      <button class="split-mode-btn ${payerMode === 'amounts' ? 'split-mode-btn--active' : ''}"
              data-pmode="amounts">Per importo</button>
      <button class="split-mode-btn ${payerMode === 'guests'  ? 'split-mode-btn--active' : ''}"
              data-pmode="guests">Con ospiti</button>
    </div>

    <div id="payer-rows">
      ${payerMode === 'guests'
        ? _renderGuestRows(trip)
        : trip.participants.map(p => _renderPayerRow(p, multiPayer, payerMode, trip)).join('')
      }
    </div>

    ${payerMode === 'amounts' ? (() => {
      const total    = parseFloat(_form.amount) || 0;
      const assigned = _form.payerPids.reduce(
        (s, pid) => s + (parseFloat(_form.payerAmountsMap[pid]) || 0), 0);
      const remaining = Math.round((total - assigned) * 100) / 100;
      if (remaining < 0.01) return '';
      return `
        <button class="btn-distribute" data-action="distribute-remaining">
          ↗ Distribuisci ${remaining.toFixed(2)}${trip.currency} per quote
        </button>`;
    })() : ''}`;
}

function _renderPayerRow(p, multiPayer, payerMode, trip) {
  const isPayer    = _form.payerPids.includes(p.id);
  const sharesPaid = _form.payerSharesMap[p.id] ?? 1;

  if (payerMode === 'amounts') {
    const amtVal  = isPayer && _form.payerAmountsMap[p.id] != null
      ? _form.payerAmountsMap[p.id] : '';
    const isPaid  = isPayer ? (_form.payerPaidMap[p.id] !== false) : true;

    // Saldo corrente del partecipante (in centesimi → euro)
    const balObj  = Selectors.participantBalance(p.id);
    const balCents = balObj?.balance ?? 0;
    const balEuros = balCents / 100;
    const balHtml  = balCents !== 0 ? `
      <span class="payer-balance-badge ${balCents > 0 ? 'payer-balance--credit' : 'payer-balance--debt'}">
        ${balCents > 0 ? '+' : ''}${balEuros.toFixed(0)}€
      </span>` : '';

    return `
      <div class="split-row ${!isPayer ? 'split-row--off' : ''}">
        <button class="split-toggle ${isPayer ? 'split-toggle--on' : ''}"
                data-ptoggle="${p.id}">
          ${participantAvatar(p, 'avatar--sm')}
          <div class="split-row__name-wrap">
            <span class="split-row__name">${p.name}</span>
            ${balHtml}
          </div>
          ${isPayer ? '<span class="split-check">✓</span>' : ''}
        </button>
        ${isPayer ? `
          <div class="payer-amt-col">
            <div class="payer-amt-wrap">
              <span class="payer-amt-currency">${trip.currency}</span>
              <input class="payer-amt-input" type="number" inputmode="decimal"
                     data-pamt="${p.id}" placeholder="0.00"
                     value="${amtVal}" min="0" step="0.01" />
            </div>
            <button class="payer-status-btn ${isPaid ? 'payer-status--paid' : 'payer-status--pending'}"
                    data-ppaid="${p.id}" title="${isPaid ? 'Già versato' : 'Da versare'}">
              ${isPaid ? '✓ Versato' : '⏱ Da versare'}
            </button>
          </div>` : ''}
      </div>`;
  }

  // Modalità quote (default)
  return `
    <div class="split-row ${!isPayer ? 'split-row--off' : ''}">
      <button class="split-toggle ${isPayer ? 'split-toggle--on' : ''}"
              data-ptoggle="${p.id}">
        ${participantAvatar(p, 'avatar--sm')}
        <span class="split-row__name">${p.name}</span>
        ${isPayer ? '<span class="split-check">✓</span>' : ''}
      </button>
      ${isPayer && multiPayer ? `
        <div class="split-row__controls">
          <button class="split-btn" data-pdelta="-1" data-ppid="${p.id}">−</button>
          <span class="split-qty" id="psq-${p.id}">${sharesPaid}</span>
          <button class="split-btn" data-pdelta="1"  data-ppid="${p.id}">+</button>
        </div>` : ''}
    </div>`;
}

// ── Modalità Con ospiti ───────────────────────────────

/** Quota base di un consumer in euro (in base a shares/amounts/equal/percent). */
function _baseQuota(pid) {
  const total = parseFloat(_form.amount) || 0;
  if (!_form.consumerPids.includes(pid)) return 0;
  if (_form.consumerMode === 'amounts') {
    return parseFloat(_form.consumerAmountsMap[pid]) || 0;
  }
  if (_form.consumerMode === 'percent') {
    return Math.round((total * (_form.consumerPercentMap[pid] ?? 0) / 100) * 100) / 100;
  }
  const totalShares = _calcConsumerShares();
  if (totalShares === 0) return 0;
  const myShares = _form.consumerMode === 'equal' ? 1 : (_form.sharesMap[pid] ?? 1);
  return Math.round((total * myShares / totalShares) * 100) / 100;
}

/** Totale che un payer deve versare (propria quota + quota ospiti assegnati, divisa per n payers). */
function _payerGuestTotal(payerPid) {
  let total = _baseQuota(payerPid);
  for (const [guestPid, payerIds] of Object.entries(_form.guestPayerMap)) {
    if (!_form.guestMap[guestPid]) continue;
    const ids = Array.isArray(payerIds) ? payerIds : [payerIds];
    if (!ids.includes(payerPid)) continue;
    // Quota ospite divisa equamente tra i payers selezionati
    total += Math.round((_baseQuota(guestPid) / ids.length) * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

function _renderGuestRows(trip) {
  const cur = trip.currency;
  // Mostra solo i consumers
  return _form.consumerPids.map(pid => {
    const p       = trip.participants.find(x => x.id === pid);
    if (!p) return '';
    const isGuest    = !!_form.guestMap[pid];
    const isGift     = isGuest && !!_form.giftMap[pid];
    const baseQuota  = _baseQuota(pid);
    const payerTotal = isGuest ? 0 : _payerGuestTotal(pid);
    const assignedIds = (() => {
      const v = _form.guestPayerMap[pid];
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    })();
    // Payers disponibili per questo ospite (tutti i non-ospiti tranne sé stesso)
    const availPayers = _form.consumerPids
      .filter(id => id !== pid && !_form.guestMap[id])
      .map(id => trip.participants.find(x => x.id === id))
      .filter(Boolean);

    // Badge saldo corrente
    const balObj   = Selectors.participantBalance(pid);
    const balCents = balObj?.balance ?? 0;
    const balHtml  = balCents !== 0 ? `
      <span class="payer-balance-badge ${balCents > 0 ? 'payer-balance--credit' : 'payer-balance--debt'}">
        ${balCents > 0 ? '+' : ''}${(balCents/100).toFixed(0)}${cur}
      </span>` : '';

    // Per i pagatori: importo effettivamente versato (da payerAmountsMap, opzionale)
    const versato   = !isGuest ? (_form.payerAmountsMap[pid] ?? null) : null;
    const rimanente = (!isGuest && versato != null && payerTotal > 0)
      ? Math.round((payerTotal - versato) * 100) / 100
      : null;
    const isPaid    = !isGuest ? (_form.payerPaidMap[pid] !== false) : true;

    return `
      <div class="guest-row ${isGuest ? 'guest-row--ospite' : ''}">
        <div class="guest-row__main">
          <div class="guest-row__info">
            ${participantAvatar(p, 'avatar--sm')}
            <div class="split-row__name-wrap">
              <span class="split-row__name">${p.name}</span>
              <span class="guest-quota-hint">${baseQuota.toFixed(2)}${cur} quota base${balHtml ? ' · ' : ''}${balHtml}</span>
            </div>
          </div>
          <div class="guest-row__actions">
            ${!isGuest ? `<span class="guest-payer-total" title="Totale dovuto">${payerTotal.toFixed(2)}${cur}</span>` : ''}
            <button class="guest-toggle-btn ${isGuest ? 'guest-toggle--ospite' : 'guest-toggle--paga'}"
                    data-gtoggle="${pid}">
              ${isGuest ? '🎫 Ospite' : '✓ Paga'}
            </button>
          </div>
        </div>

        ${!isGuest ? `
          <div class="payer-amt-col" style="margin:4px 0 2px 0">
            <input type="number" inputmode="decimal"
                   class="amount-input ${rimanente !== null && rimanente > 0.01 ? 'amount-input--partial' : ''}"
                   data-pamt="${pid}"
                   value="${versato !== null ? versato : ''}"
                   placeholder="${payerTotal.toFixed(2)}"
                   min="0" step="0.01" />
            <span class="amount-unit">${cur}</span>
            <button class="payer-status-btn ${isPaid ? 'payer-status--paid' : 'payer-status--pending'}"
                    data-ppaid="${pid}" title="${isPaid ? 'Versato' : 'Da versare'}">
              ${isPaid ? '✓' : '⏱'}
            </button>
            ${rimanente !== null && rimanente > 0.01 ? `
              <span class="text-warning" style="font-size:11px;margin-left:4px">
                −${rimanente.toFixed(2)}${cur}
              </span>` : ''}
          </div>` : ''}

        ${isGuest ? `
          <div class="guest-payer-select">
            <span class="guest-payer-label">Pagato da (multi):</span>
            <div class="guest-chips">
              ${availPayers.length
                ? availPayers.map(pp => `
                    <button class="guest-chip ${assignedIds.includes(pp.id) ? 'guest-chip--active' : ''}"
                            data-gpayer="${pid}" data-gpayerid="${pp.id}">
                      ${pp.name}
                    </button>`).join('')
                : `<span class="guest-no-payers">Nessun pagatore disponibile</span>`
              }
            </div>
            ${assignedIds.length > 1 ? `
              <span class="guest-split-hint">
                Quota divisa in ${assignedIds.length} parti uguali
              </span>` : ''}
          </div>
          <div class="guest-gift-row">
            <button class="guest-gift-btn ${isGift ? 'guest-gift-btn--active' : ''}"
                    data-ggift="${pid}">
              ${isGift ? '🎁 Offerta — nessun debito' : '🎁 Segna come offerta'}
            </button>
          </div>` : ''}
      </div>`;
  }).join('');
}

// Balance indicator consumers (modalità percentuale)
function _consumerPercentInfo() {
  const total = _form.consumerPids.reduce(
    (s, pid) => s + (parseFloat(_form.consumerPercentMap[pid]) || 0), 0);
  const diff = 100 - total;
  if (Math.abs(diff) < 0.05) return { text: '✓ 100%', cls: 'text-positive' };
  if (diff > 0) return { text: `Mancano ${diff.toFixed(1)}%`, cls: 'text-negative' };
  return { text: `Eccesso ${(-diff).toFixed(1)}%`, cls: 'text-negative' };
}

// Balance indicator consumers (modalità importo esatto)
function _consumerBalanceInfo(trip) {
  const total    = parseFloat(_form.amount) || 0;
  const assigned = _form.consumerPids.reduce(
    (s, pid) => s + (parseFloat(_form.consumerAmountsMap[pid]) || 0), 0);
  const diff = total - assigned;
  const cur  = trip?.currency ?? '€';
  if (total === 0) return { text: '—', cls: '' };
  if (Math.abs(diff) < 0.005) return { text: '✓ Bilanciato', cls: 'text-positive' };
  if (diff > 0) return { text: `Mancano ${diff.toFixed(2)}${cur}`, cls: 'text-negative' };
  return { text: `Eccesso ${(-diff).toFixed(2)}${cur}`, cls: 'text-negative' };
}

// Calcola testo + classe per il balance indicator in modalità importo
function _payerBalanceInfo(trip) {
  const total    = parseFloat(_form.amount) || 0;
  const assigned = _form.payerPids.reduce(
    (s, pid) => s + (parseFloat(_form.payerAmountsMap[pid]) || 0), 0);
  const diff = total - assigned;
  const cur  = trip?.currency ?? '€';
  if (total === 0) return { text: '—', cls: '' };
  if (Math.abs(diff) < 0.005) return { text: '✓ Bilanciato', cls: 'text-positive' };
  // Somma parziale: pagamento non ancora completo — OK, si può salvare
  if (diff > 0) return { text: `Ancora da pagare: ${diff.toFixed(2)}${cur}`, cls: 'text-warning' };
  // Eccesso: errore bloccante
  return { text: `Eccesso di ${(-diff).toFixed(2)}${cur}`, cls: 'text-negative' };
}

// ── Refresh parziali ──────────────────────────────────
function _refreshConsumers(trip) {
  const card = document.getElementById('card-consumers');
  if (card) card.innerHTML = _renderConsumers(trip);
  _bindConsumerEvents(trip);
}

function _refreshPayers(trip) {
  const card = document.getElementById('card-payers');
  if (card) card.innerHTML = _renderPayers(trip);
  _bindPayerEvents(trip);
}

function _refreshConsumerSummary() {
  const trip = State.currentTrip;
  const el   = document.getElementById('consumer-summary');
  if (!el) return;

  if (_form.consumerMode === 'amounts') {
    const { text, cls } = _consumerBalanceInfo(trip);
    el.textContent = text;
    el.className   = `section-sub ${cls}`;
    return;
  }
  if (_form.consumerMode === 'percent') {
    const { text, cls } = _consumerPercentInfo();
    el.textContent = text;
    el.className   = `section-sub ${cls}`;
    return;
  }

  const amount   = parseFloat(_form.amount) || 0;
  const isShares = _form.consumerMode === 'shares';
  const total    = _calcConsumerShares();
  const perUnit  = total > 0 && amount
    ? ` · ${(amount / total).toFixed(2)}${trip?.currency ?? '€'}/${isShares ? 'q' : 'pers.'}`
    : '';
  el.className   = 'section-sub';
  el.textContent = `${_form.consumerPids.length} partecipanti${perUnit}`;
}

// ── Event binding consumers ───────────────────────────
function _bindConsumerEvents(trip) {
  // Preset
  document.getElementById('consumer-presets')
    ?.addEventListener('click', e => {
      // Salva selezione come preset
      if (e.target.closest('[data-action="save-split-preset"]')) {
        Modal.prompt({
          title:        'Salva divisione',
          placeholder:  'es. Solo coppia, Adulti…',
          confirmLabel: 'Salva',
          onConfirm: async (name) => {
            if (!name) return;
            const result = await Actions.saveSplitPreset(trip.id, {
              name,
              participantIds: [..._form.consumerPids],
            });
            if (!result.ok) { Toast.show('Impossibile salvare il preset', { type: 'error' }); return; }
            Toast.show(`Preset "${name}" salvato ⭐`, { type: 'success' });
            _refreshConsumers(trip);  // aggiorna i chip
          },
        });
        return;
      }
      const btn = e.target.closest('[data-cpreset]');
      if (!btn) return;
      _applyConsumerPreset(btn.dataset.cpreset, trip);
      _refreshConsumers(trip);
    });

  // Mode toggle
  document.getElementById('consumer-mode')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cmode]');
      if (!btn) return;
      const newMode = btn.dataset.cmode;
      // Passando a 'amounts': pre-compila con divisione proporzionale alle quote correnti
      if (newMode === 'amounts') {
        _prefillConsumerAmounts(trip);
      }
      // Passando a 'percent': distribuisce 100% equamente
      if (newMode === 'percent') {
        _prefillConsumerPercents();
      }
      _form.consumerMode = newMode;
      _refreshConsumers(trip);
    });

  // Toggle partecipante (custom)
  document.getElementById('consumer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ctoggle]');
      if (!btn || btn.disabled) return;
      const pid = btn.dataset.ctoggle;
      const idx = _form.consumerPids.indexOf(pid);
      if (idx === -1) {
        _form.consumerPids.push(pid);
        if (!(_form.sharesMap[pid] > 0)) _form.sharesMap[pid] = 1;
        // In amounts mode: pre-compila con il rimanente
        if (_form.consumerMode === 'amounts') {
          const total   = parseFloat(_form.amount) || 0;
          const already = _form.consumerPids
            .filter(id => id !== pid)
            .reduce((s, id) => s + (parseFloat(_form.consumerAmountsMap[id]) || 0), 0);
          _form.consumerAmountsMap[pid] = Math.max(0, parseFloat((total - already).toFixed(2)));
        }
        // In percent mode: ridistribuisce il 100% equamente
        if (_form.consumerMode === 'percent') {
          _prefillConsumerPercents();
        }
      } else {
        if (_form.consumerPids.length <= 1) return;
        _form.consumerPids.splice(idx, 1);
        delete _form.consumerAmountsMap[pid];
        delete _form.consumerPercentMap[pid];
        // In percent mode: ridistribuisce il 100% equamente
        if (_form.consumerMode === 'percent') {
          _prefillConsumerPercents();
        }
      }
      _refreshConsumers(trip);
    });

  // Input importo diretto (modalità amounts)
  document.getElementById('consumer-rows')
    ?.addEventListener('input', e => {
      const input = e.target.closest('[data-camt]');
      if (!input) return;
      _form.consumerAmountsMap[input.dataset.camt] = parseFloat(input.value) || 0;
      _refreshConsumerSummary();
    });

  // Input percentuale (modalità percent)
  document.getElementById('consumer-rows')
    ?.addEventListener('input', e => {
      const input = e.target.closest('[data-cpct]');
      if (!input) return;
      const val = parseFloat(input.value);
      _form.consumerPercentMap[input.dataset.cpct] = isNaN(val) ? 0 : Math.min(100, Math.max(0, val));
      _refreshConsumerSummary();
    });

  // Quote stepper
  document.getElementById('consumer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cdelta]');
      if (!btn) return;
      const pid   = btn.dataset.cpid;
      const delta = parseInt(btn.dataset.cdelta);
      _form.sharesMap[pid] = Math.max(1, (_form.sharesMap[pid] ?? 1) + delta);
      const el = document.getElementById(`csq-${pid}`);
      if (el) el.textContent = _form.sharesMap[pid];
      _refreshConsumerSummary();
    });
}

// ── Event binding payers ──────────────────────────────
function _bindPayerEvents(trip) {
  // Mode toggle (quote / importo)
  document.getElementById('payer-mode')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-pmode]');
      if (!btn) return;
      const prevMode = _form.payerMode;
      const newMode  = btn.dataset.pmode;

      // ── Migrazione dati tra modalità ─────────────────────
      if (newMode === 'guests' && prevMode !== 'guests') {
        // Azzera payerAmountsMap: eventuali importi inseriti in "Per importo"
        // non devono contaminare la vista ospiti (causano sum(sharesPaid) ≠ total)
        _form.payerAmountsMap = {};

        const hasGuestConfig = Object.keys(_form.guestMap).length > 0;
        if (!hasGuestConfig) {
          // Quanti consumer NON sono in payerPids?
          const nonPayers = _form.consumerPids.filter(pid => !_form.payerPids.includes(pid));
          if (nonPayers.length > 0) {
            // Caso normale: chi non era tra i pagatori diventa ospite
            _form.consumerPids.forEach(pid => {
              _form.guestMap[pid] = !_form.payerPids.includes(pid);
            });
          }
          // Se tutti i consumer erano in payerPids (es. "Per quote" con tutti selezionati)
          // non pre-popolare guestMap: l'utente marcherà gli ospiti a mano
        }
        // Assicura che payerPids rifletta i non-ospiti attuali
        _form.payerPids = _form.consumerPids.filter(pid => !_form.guestMap[pid]);
      }
      if (newMode !== 'guests' && prevMode === 'guests') {
        // Ricostruisci payerPids dai non-ospiti mantenendo gli amounts già inseriti
        _form.payerPids = _form.consumerPids.filter(pid => !_form.guestMap[pid]);
      }

      _form.payerMode = newMode;
      _refreshPayers(trip);
    });

  // Toggle payer on/off
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ptoggle]');
      if (!btn) return;
      const pid = btn.dataset.ptoggle;
      const idx = _form.payerPids.indexOf(pid);
      if (idx === -1) {
        _form.payerPids.push(pid);
        if (!_form.payerSharesMap[pid]) _form.payerSharesMap[pid] = 1;
        // In amounts mode: non pre-compilare, l'utente inserisce o usa "Distribuisci"
      } else {
        // In modalità quote: almeno 1 payer obbligatorio
        // In modalità importo: si può svuotare la lista (si ricostruisce a mano o con Distribuisci)
        if (_form.payerMode === 'shares' && _form.payerPids.length <= 1) return;
        _form.payerPids.splice(idx, 1);
        delete _form.payerSharesMap[pid];
        delete _form.payerAmountsMap[pid];
      }
      _refreshPayers(trip);
    });

  // Stepper quote (modalità shares)
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-pdelta]');
      if (!btn) return;
      const pid   = btn.dataset.ppid;
      const delta = parseInt(btn.dataset.pdelta);
      _form.payerSharesMap[pid] = Math.max(1, (_form.payerSharesMap[pid] ?? 1) + delta);
      const el = document.getElementById(`psq-${pid}`);
      if (el) el.textContent = _form.payerSharesMap[pid];
    });

  // Input importo diretto (modalità amounts e guests)
  document.getElementById('payer-rows')
    ?.addEventListener('input', e => {
      const input = e.target.closest('[data-pamt]');
      if (!input) return;
      const pid = input.dataset.pamt;
      const val = parseFloat(input.value);
      // Salva null (non ancora inserito) vs valore reale — evita confusione con 0
      if (!isNaN(val) && val > 0) {
        _form.payerAmountsMap[pid] = val;
      } else {
        delete _form.payerAmountsMap[pid];
      }
      // In guests mode non chiamare _refreshDistributeBtn (causerebbe re-render che azzera il campo)
      if (_form.payerMode === 'amounts') {
        _refreshPayerSummary(trip);
        _refreshDistributeBtn(trip);
      }
    });

  // Guests mode: toggle paga/ospite
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-gtoggle]');
      if (!btn) return;
      const pid = btn.dataset.gtoggle;
      _form.guestMap[pid] = !_form.guestMap[pid];

      if (_form.guestMap[pid]) {
        // Diventa ospite: rimuovi da payerPids, cancella importo, pulisci assegnazioni ospiti
        const idx = _form.payerPids.indexOf(pid);
        if (idx !== -1) _form.payerPids.splice(idx, 1);
        delete _form.payerAmountsMap[pid];
        delete _form.payerSharesMap[pid];
        // Rimuovi questo payer dalle assegnazioni degli altri ospiti
        for (const [gPid, payerIds] of Object.entries(_form.guestPayerMap)) {
          if (Array.isArray(payerIds)) {
            const filtered = payerIds.filter(id => id !== pid);
            if (filtered.length) _form.guestPayerMap[gPid] = filtered;
            else delete _form.guestPayerMap[gPid];
          } else if (payerIds === pid) {
            delete _form.guestPayerMap[gPid];
          }
        }
      } else {
        // Diventa pagante: aggiungi a payerPids, rimuovi da guestPayerMap/giftMap (non è più ospite)
        if (!_form.payerPids.includes(pid)) _form.payerPids.push(pid);
        delete _form.guestPayerMap[pid];
        delete _form.giftMap[pid];
      }
      _refreshPayers(trip);
    });

  // Guests mode: toggle payer per ospite (multi-select)
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-gpayer]');
      if (!btn) return;
      const guestPid = btn.dataset.gpayer;
      const payerPid = btn.dataset.gpayerid;
      const current  = _form.guestPayerMap[guestPid];
      const arr      = Array.isArray(current) ? [...current] : (current ? [current] : []);
      const idx      = arr.indexOf(payerPid);
      if (idx === -1) arr.push(payerPid);
      else            arr.splice(idx, 1);
      _form.guestPayerMap[guestPid] = arr;
      _refreshPayers(trip);
    });

  // Guests mode: toggle offerta/regalo per ospite
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ggift]');
      if (!btn) return;
      const pid = btn.dataset.ggift;
      _form.giftMap[pid] = !_form.giftMap[pid];
      _refreshPayers(trip);
    });

  // Toggle versato / da versare
  document.getElementById('payer-rows')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ppaid]');
      if (!btn) return;
      const pid = btn.dataset.ppaid;
      _form.payerPaidMap[pid] = !(_form.payerPaidMap[pid] !== false);
      // Aggiorna solo il bottone senza ridisegnare tutta la sezione
      const isPaid = _form.payerPaidMap[pid] !== false;
      btn.textContent = isPaid ? '✓ Versato' : '⏱ Da versare';
      btn.className   = `payer-status-btn ${isPaid ? 'payer-status--paid' : 'payer-status--pending'}`;
    });

  // Bottone "Distribuisci rimanente per quote"
  document.getElementById('card-payers')
    ?.addEventListener('click', e => {
      if (!e.target.closest('[data-action="distribute-remaining"]')) return;
      _distributeRemainingToConsumers(trip);
      _refreshPayers(trip);
    });
}

function _refreshDistributeBtn(trip) {
  // Solo in modalità 'amounts' — evita re-render indesiderati in altre modalità
  if (_form.payerMode !== 'amounts') return;
  const btn = document.querySelector('[data-action="distribute-remaining"]');
  const total    = parseFloat(_form.amount) || 0;
  const assigned = _form.payerPids.reduce(
    (s, pid) => s + (parseFloat(_form.payerAmountsMap[pid]) || 0), 0);
  const remaining = Math.round((total - assigned) * 100) / 100;
  if (!btn && remaining >= 0.01) { _refreshPayers(trip); return; }
  if (btn && remaining < 0.01)  { _refreshPayers(trip); return; }
  if (btn) btn.textContent = `↗ Distribuisci ${remaining.toFixed(2)}${trip?.currency ?? '€'} per quote`;
}

function _refreshPayerSummary(trip) {
  if (_form.payerMode !== 'amounts') return;
  const el = document.getElementById('payer-summary');
  if (!el) return;
  const { text, cls } = _payerBalanceInfo(trip);
  el.textContent = text;
  el.className   = `section-sub ${cls}`;
}

/**
 * Distribuisce il rimanente tra i consumatori (quelli non esclusi)
 * proporzionalmente alle loro quote, aggiungendolo all'importo già pagato.
 */
function _distributeRemainingToConsumers(trip) {
  const total    = parseFloat(_form.amount) || 0;
  const assigned = _form.payerPids.reduce(
    (s, pid) => s + (parseFloat(_form.payerAmountsMap[pid]) || 0), 0);
  const remaining = Math.round((total - assigned) * 100) / 100;
  if (remaining < 0.01) return;

  // Solo i payers SELEZIONATI che non hanno ancora un importo versato.
  // I genitori (o chiunque deselezionato dai pagatori) vengono ignorati.
  const pids = _form.payerPids.filter(
    pid => !(parseFloat(_form.payerAmountsMap[pid]) > 0)
  );
  if (!pids.length) return;

  // Peso proporzionale alle quote di consumo dei singoli payers
  const weights = pids.map(pid => {
    if (!_form.consumerPids.includes(pid)) return 1; // payer non è consumer → peso neutro
    if (_form.consumerMode === 'amounts') return parseFloat(_form.consumerAmountsMap[pid]) || 1;
    return _form.consumerMode === 'equal' ? 1 : (_form.sharesMap[pid] ?? 1);
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  let left = remaining;
  pids.forEach((pid, i) => {
    let share;
    if (i === pids.length - 1) {
      share = Math.round(left * 100) / 100;
    } else {
      share = Math.floor((remaining * weights[i] / totalWeight) * 100) / 100;
      left  = Math.round((left - share) * 100) / 100;
    }
    if (!_form.payerPids.includes(pid)) _form.payerPids.push(pid);
    _form.payerAmountsMap[pid] = share; // SET: non somma, assegna direttamente
  });
}

// ── Preset consumers ──────────────────────────────────
function _applyConsumerPreset(preset, trip) {
  _form.consumerPreset = preset;

  if (preset === 'tutti') {
    _form.consumerPids = trip.participants.map(p => p.id);

  } else if (preset === 'presenti') {
    const date = _form.date || _today();
    _form.consumerPids = trip.participants
      .filter(p => {
        const start = State.getParticipantStartDate(p, trip);
        const end   = State.getParticipantEndDate(p, trip);
        return date >= start && date <= end;
      })
      .map(p => p.id);

    if (_form.consumerPids.length === 0) {
      _form.consumerPids = trip.participants.map(p => p.id);
      Toast.show('Nessuno presente in questa data — selezionati tutti', { type: 'info' });
    }

  } else if (preset.startsWith('g:')) {
    const gid   = preset.slice(2);
    const group = trip.groups?.find(g => g.id === gid);
    if (group) {
      _form.consumerPids = (group.members ?? []).filter(
        pid => trip.participants.find(p => p.id === pid)
      );
      if (_form.consumerPids.length === 0) {
        _form.consumerPids = trip.participants.map(p => p.id);
        Toast.show(`Gruppo "${group.name}" è vuoto — selezionati tutti`, { type: 'info' });
      }
    }

  } else if (preset.startsWith('sp:')) {
    const spId = preset.slice(3);
    const sp   = (trip.splitPresets ?? []).find(p => p.id === spId);
    if (sp) {
      _form.consumerPids = (sp.participantIds ?? []).filter(
        pid => trip.participants.find(p => p.id === pid)
      );
      if (_form.consumerPids.length === 0) {
        _form.consumerPids = trip.participants.map(p => p.id);
        Toast.show(`Preset "${sp.name}" non più valido — selezionati tutti`, { type: 'info' });
      }
    }

  } else {
    // custom — mantieni selezione attuale
  }

  // Garantisce shares ≥ 1 per tutti i selezionati
  for (const pid of _form.consumerPids) {
    if (!(_form.sharesMap[pid] >= 1)) _form.sharesMap[pid] = 1;
  }
}

// ── Salva ─────────────────────────────────────────────
async function _handleSave(trip) {
  const title  = document.getElementById('f-title')?.value.trim();
  const amount = parseFloat(document.getElementById('f-amount')?.value);
  const date   = document.getElementById('f-date')?.value || _today();

  if (!title)                   return Toast.show('Inserisci una descrizione',  { type: 'error' });
  if (!amount || isNaN(amount)) return Toast.show('Inserisci un importo valido', { type: 'error' });
  if (_form.consumerPids.length === 0) return Toast.show('Seleziona almeno un consumer', { type: 'error' });
  if (_form.payerPids.length === 0)    return Toast.show('Seleziona chi ha pagato', { type: 'error' });

  // Validazione modalità importo esatto consumers
  if (_form.consumerMode === 'amounts') {
    const assigned = _form.consumerPids.reduce(
      (s, pid) => s + (parseFloat(_form.consumerAmountsMap[pid]) || 0), 0);
    const diff = Math.abs(amount - assigned);
    if (diff >= 0.01) {
      const trip = State.currentTrip;
      const cur  = trip?.currency ?? '€';
      const msg  = amount > assigned
        ? `Consumatori: mancano ${(amount - assigned).toFixed(2)}${cur}`
        : `Consumatori: eccesso di ${(assigned - amount).toFixed(2)}${cur}`;
      return Toast.show(msg, { type: 'error' });
    }
  }

  // Validazione modalità percentuale consumers
  if (_form.consumerMode === 'percent') {
    const total = _form.consumerPids.reduce(
      (s, pid) => s + (parseFloat(_form.consumerPercentMap[pid]) || 0), 0);
    if (Math.abs(total - 100) >= 0.1) {
      const msg = total < 100
        ? `Percentuali: mancano ${(100 - total).toFixed(1)}%`
        : `Percentuali: eccesso di ${(total - 100).toFixed(1)}%`;
      return Toast.show(msg, { type: 'error' });
    }
  }

  // Validazione modalità importo esatto payers:
  // — ammessa la somma parziale (qualcuno deve ancora pagare)
  // — bloccato solo l'eccesso (non si può pagare più del totale)
  if (_form.payerMode === 'amounts') {
    const payerAssigned = _form.payerPids.reduce(
      (s, pid) => s + (parseFloat(_form.payerAmountsMap[pid]) || 0), 0);
    if (payerAssigned > amount + 0.009) {
      const cur = State.currentTrip?.currency ?? '€';
      return Toast.show(
        `Pagatori: eccesso di ${(payerAssigned - amount).toFixed(2)}${cur}`,
        { type: 'error' }
      );
    }
  }

  // Validazione modalità Con ospiti
  if (_form.payerMode === 'guests') {
    const unassignedGuests = _form.consumerPids.filter(pid => {
      if (!_form.guestMap[pid]) return false;
      const v = _form.guestPayerMap[pid];
      return !v || (Array.isArray(v) && v.length === 0);
    });
    if (unassignedGuests.length) {
      const names = unassignedGuests
        .map(pid => State.currentTrip?.participants.find(p => p.id === pid)?.name ?? pid)
        .join(', ');
      return Toast.show(`Assegna chi paga per: ${names}`, { type: 'error' });
    }
    const nonGuestCount = _form.consumerPids.filter(pid => !_form.guestMap[pid]).length;
    if (nonGuestCount === 0) {
      return Toast.show('Ci deve essere almeno un pagatore', { type: 'error' });
    }
  }

  const consumers = _buildConsumers();
  const payers    = _buildPayers();

  const payload = {
    title,
    amount,
    date,
    category: _form.category,
    notes:    _form.notes,
    consumers,
    payers,
    splitMeta: {
      payerMode:    _form.payerMode,
      consumerMode: _form.consumerMode,
      // Salva mappa ospiti per ricostruzione in edit mode
      guests: _form.payerMode === 'guests'
        ? Object.entries(_form.guestPayerMap)
            .filter(([gPid]) => _form.guestMap[gPid])
            .map(([guestId, payerIds]) => ({
              guestId,
              payerIds: Array.isArray(payerIds) ? payerIds : [payerIds],
              gift:     !!_form.giftMap[guestId],
            }))
        : undefined,
      // Salva gli importi effettivamente versati (solo modalità ospiti)
      // Permette di distinguere "importo inserito dall'utente" da "quota teorica"
      payerAmounts: _form.payerMode === 'guests'
        ? Object.fromEntries(
            Object.entries(_form.payerAmountsMap)
              .filter(([pid]) => !_form.guestMap[pid] && _form.payerAmountsMap[pid] != null)
          )
        : undefined,
    },
  };

  let saved;
  if (_editExpenseId) {
    const result = await Actions.updateExpense(_editExpenseId, payload);
    if (!result.ok) return Toast.show(result.errors[0], { type: 'error' });
    saved = result.value;
    Toast.show(`"${title}" aggiornata`);
  } else {
    const result = await Actions.createExpense(trip.id, payload);
    if (!result.ok) return Toast.show(result.errors[0], { type: 'error' });
    saved = result.value;
    Toast.show(`"${title}" salvata`);
  }

  // Transport date sync
  if (_form.category === 'trasporti' && _form.transportSync) {
    const tDate  = document.getElementById('f-transport-date')?.value || date;
    const pids   = _form.consumerPids;
    const tType  = _form.transportType;
    await Actions.syncTransportDates(trip.id, pids, tDate, tType);
    const label  = tType === 'andata' ? 'arrivo' : 'partenza';
    Toast.show(`📅 Date ${label} aggiornate`, { type: 'success' });
  }

  // Backup automatico silenzioso (una volta al giorno)
  maybeAutoBackup();

  const dest = _editExpenseId ? 'expenses' : 'trip';
  _reset();
  Router.go(dest, { tripId: trip.id });
}

// ── Helpers ───────────────────────────────────────────

function _buildConsumers() {
  if (_form.consumerMode === 'amounts') {
    // Salva gli importi in euro direttamente (×100 non serve: il motore usa i rapporti)
    return _form.consumerPids.map(pid => ({
      participantId: pid,
      shares: Math.round((_form.consumerAmountsMap[pid] ?? 0) * 100) / 100 || 0.01,
    }));
  }
  if (_form.consumerMode === 'percent') {
    // Salva le percentuali direttamente come shares — il motore usa i rapporti,
    // quindi 25:50:25 equivale a 1:2:1. La somma deve essere ~100.
    return _form.consumerPids.map(pid => ({
      participantId: pid,
      shares: Math.max(0.01, _form.consumerPercentMap[pid] ?? 0),
    }));
  }
  return _form.consumerPids.map(pid => ({
    participantId: pid,
    shares: _form.consumerMode === 'equal' ? 1 : (_form.sharesMap[pid] ?? 1),
  }));
}

function _buildPayers() {
  if (_form.payerMode === 'guests') {
    // In modalità Con ospiti, sharesPaid = responsabilità teorica di ciascun pagante
    // (quota propria + quote degli ospiti assegnati, divise equamente tra co-paganti).
    //
    // PERCHÉ TEORICA e non l'importo versato in cassa:
    //   1. sum(_payerGuestTotal) = amount per costruzione → motore contabile corretto
    //   2. I suggerimenti "Da saldare" rispettano le relazioni ospite→pagante
    //
    // L'importo inserito nel campo "versato" (payerAmountsMap) è solo un tracker di
    // pagamento (mostrato come rimanente nel UI), NON influenza i crediti contabili.
    const nonGuestPids = _form.consumerPids.filter(pid => !_form.guestMap[pid]);

    // L'ultimo payer assorbe gli arrotondamenti per garantire sum = amount esatto
    const total = parseFloat(_form.amount) || 0;
    const theoreticals = nonGuestPids.map(pid => _payerGuestTotal(pid) || 0.01);
    const theoreticalSum = theoreticals.reduce((s, v) => s + v, 0);
    let leftover = total;

    return nonGuestPids.map((pid, i) => {
      let sharesPaid;
      if (i === nonGuestPids.length - 1) {
        sharesPaid = Math.max(0.01, Math.round(leftover * 100) / 100);
      } else {
        sharesPaid = theoreticalSum > 0
          ? Math.round((theoreticals[i] / theoreticalSum * total) * 100) / 100
          : Math.round((total / nonGuestPids.length) * 100) / 100;
        sharesPaid = Math.max(0.01, sharesPaid);
        leftover   = Math.round((leftover - sharesPaid) * 100) / 100;
      }
      return {
        participantId: pid,
        sharesPaid,
        paid: _form.payerPaidMap[pid] !== false,
      };
    });
  }
  if (_form.payerMode === 'amounts') {
    return _form.payerPids.map(pid => ({
      participantId: pid,
      sharesPaid: Math.round((_form.payerAmountsMap[pid] ?? 0) * 100) / 100 || 0.01,
      paid: _form.payerPaidMap[pid] !== false,
    }));
  }
  return _form.payerPids.map(pid => ({
    participantId: pid,
    sharesPaid: _form.payerSharesMap[pid] ?? 1,
    paid: true,
  }));
}

function _calcConsumerShares() {
  if (_form.consumerMode === 'equal')   return _form.consumerPids.length;
  if (_form.consumerMode === 'percent') return _form.consumerPids.reduce((s, pid) => s + (_form.consumerPercentMap[pid] ?? 0), 0);
  return _form.consumerPids.reduce((s, pid) => s + (_form.sharesMap[pid] ?? 1), 0);
}

/**
 * Pre-compila consumerPercentMap distribuendo il 100% equamente.
 * L'ultimo riceve il residuo per garantire la somma esatta.
 */
function _prefillConsumerPercents() {
  const pids = _form.consumerPids;
  const n    = pids.length;
  if (n === 0) return;
  const base = Math.floor((100 / n) * 10) / 10; // arrotonda a 1 decimale
  let remaining = 100;
  pids.forEach((pid, i) => {
    if (i === n - 1) {
      _form.consumerPercentMap[pid] = Math.round(remaining * 10) / 10;
    } else {
      _form.consumerPercentMap[pid] = base;
      remaining = Math.round((remaining - base) * 10) / 10;
    }
  });
}

/**
 * Pre-compila consumerAmountsMap proporzionalmente alle quote correnti.
 * L'ultimo riceve il residuo per garantire la somma esatta.
 */
function _prefillConsumerAmounts(trip) {
  const total = parseFloat(_form.amount) || 0;
  const pids  = _form.consumerPids;
  const n     = pids.length;
  if (n === 0 || total === 0) return;

  const totalShares = _calcConsumerShares();
  let remaining = total;

  pids.forEach((pid, i) => {
    if (i === n - 1) {
      // Ultimo: prende il residuo (evita errori di arrotondamento)
      _form.consumerAmountsMap[pid] = Math.round(remaining * 100) / 100;
    } else {
      const share = _form.consumerMode === 'equal'
        ? 1
        : (_form.sharesMap[pid] ?? 1);
      const amt = Math.floor((total * share / totalShares) * 100) / 100;
      _form.consumerAmountsMap[pid] = amt;
      remaining -= amt;
    }
  });
}

// ── OCR Scontrino ─────────────────────────────────────
async function _handleOCR(event, trip) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';  // reset per permettere stessa foto

  const btn    = document.getElementById('btn-attach');
  const result = document.getElementById('ocr-result');

  // Stato: caricamento
  if (btn) {
    btn.innerHTML = `<span class="ocr-spinner"></span> Lettura in corso…`;
    btn.style.pointerEvents = 'none';
  }
  if (result) result.style.display = 'none';

  try {
    const text   = await OCR.recognize(file, pct => {
      if (btn) btn.querySelector('span') && (btn.firstChild.textContent
        ? null : btn.firstChild.nodeValue);
      // Aggiorna percentuale nel pulsante
      const span = btn?.querySelector('.ocr-spinner');
      if (span) span.textContent = `${pct}%`;
    });

    const parsed = parseReceipt(text);
    _showOCRResult(parsed, trip);

  } catch (err) {
    console.error('[OCR]', err);
    Toast.show('Lettura scontrino fallita — controlla la connessione', { type: 'error' });
    _resetOCRBtn();
  }
}

function _showOCRResult(parsed, trip) {
  _resetOCRBtn();

  const resultEl = document.getElementById('ocr-result');
  if (!resultEl) return;

  const amountStr = parsed.amount
    ? `${parsed.amount.toFixed(2)} ${trip.currency}`
    : null;

  const catObj = CATEGORIES.find(c => c.id === parsed.category);

  resultEl.style.display = '';
  resultEl.innerHTML = `
    <div class="ocr-card">
      <div class="ocr-card__header">
        <span class="ocr-icon">🧾</span>
        <span class="ocr-card__title">Scontrino analizzato</span>
        <button class="ocr-dismiss" id="btn-ocr-dismiss">✕</button>
      </div>
      <div class="ocr-card__body">
        ${parsed.title ? `
          <div class="ocr-row">
            <span class="ocr-label">Negozio</span>
            <span class="ocr-value">${parsed.title}</span>
          </div>` : ''}
        ${amountStr ? `
          <div class="ocr-row">
            <span class="ocr-label">Totale</span>
            <span class="ocr-value ocr-amount">${amountStr}</span>
          </div>` : ''}
        <div class="ocr-row">
          <span class="ocr-label">Categoria</span>
          <span class="ocr-value">${catObj?.icon ?? '📋'} ${catObj?.label ?? parsed.category}</span>
        </div>
        ${!parsed.amount && !parsed.title
          ? `<p class="ocr-warning">⚠ Nessun dato riconosciuto. Controlla l'immagine.</p>`
          : ''}
      </div>
      <div class="ocr-card__actions">
        <button class="btn-ocr-apply" id="btn-ocr-apply"
                ${(!parsed.amount && !parsed.title) ? 'disabled' : ''}>
          ✓ Usa questi dati
        </button>
      </div>
    </div>`;

  // Applica dati al form
  document.getElementById('btn-ocr-apply')?.addEventListener('click', () => {
    if (parsed.amount) {
      const amtEl = document.getElementById('f-amount');
      if (amtEl && !amtEl.value) {
        amtEl.value = parsed.amount.toFixed(2);
        _form.amount = amtEl.value;
        _refreshConsumerSummary();
      }
    }
    if (parsed.title) {
      const titleEl = document.getElementById('f-title');
      if (titleEl && !titleEl.value) titleEl.value = parsed.title;
    }
    if (parsed.category) {
      _form.category = parsed.category;
      document.querySelectorAll('[data-cat]')
        .forEach(b => b.classList.toggle('category-chip--active', b.dataset.cat === parsed.category));
      // Mostra/nascondi sezione trasporto
      const tc = document.getElementById('card-transport');
      if (tc) tc.style.display = parsed.category === 'trasporti' ? '' : 'none';
    }
    resultEl.style.display = 'none';
    Toast.show('Dati applicati al form', { type: 'success' });
  });

  // Chiudi
  document.getElementById('btn-ocr-dismiss')?.addEventListener('click', () => {
    resultEl.style.display = 'none';
  });
}

function _resetOCRBtn() {
  const btn = document.getElementById('btn-attach');
  if (btn) {
    btn.innerHTML = `📷 Scansiona scontrino <input type="file" id="input-receipt" accept="image/*" capture="environment" style="display:none" />`;
    btn.style.pointerEvents = '';
    // Ribinda il listener (perché abbiamo riscritto innerHTML)
    document.getElementById('input-receipt')
      ?.addEventListener('change', e => _handleOCR(e, State.currentTrip));
  }
}

// ── Transport date sync ───────────────────────────────
function _renderTransport() {
  const on   = _form.transportSync;
  const type = _form.transportType;
  const date = _form.transportDate ?? _form.date ?? _today();

  return `
    <div class="section-header" style="margin-bottom: ${on ? '14px' : '0'}">
      <label class="field-label" style="margin:0">✈ Trasporto di viaggio</label>
      <button class="transport-toggle-btn ${on ? 'transport-toggle-btn--on' : ''}"
              id="btn-transport-toggle">
        ${on ? '✓ Attivo' : 'Attiva'}
      </button>
    </div>
    ${on ? `
      <div id="transport-options">
        <div class="split-mode-toggle" style="margin-bottom:12px">
          <button class="split-mode-btn ${type === 'andata'  ? 'split-mode-btn--active' : ''}"
                  data-ttype="andata">↗ Andata</button>
          <button class="split-mode-btn ${type === 'ritorno' ? 'split-mode-btn--active' : ''}"
                  data-ttype="ritorno">↙ Ritorno</button>
        </div>
        <label class="field-label">Data ${type === 'andata' ? 'arrivo' : 'partenza'}</label>
        <input id="f-transport-date" class="input" type="date" value="${date}"
               style="margin-bottom:8px" />
        <p class="transport-hint">Aggiorna la data di ${type === 'andata' ? 'arrivo' : 'partenza'}
           dei consumer selezionati nel viaggio.</p>
      </div>` : ''}`;
}

function _refreshTransport() {
  const card = document.getElementById('card-transport');
  if (card) card.innerHTML = _renderTransport();
  _bindTransportEvents();
}

function _bindTransportEvents() {
  document.getElementById('btn-transport-toggle')
    ?.addEventListener('click', () => {
      _form.transportSync = !_form.transportSync;
      _refreshTransport();
    });

  document.getElementById('transport-options')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-ttype]');
      if (!btn) return;
      _form.transportType = btn.dataset.ttype;
      _refreshTransport();
    });

  document.getElementById('f-transport-date')
    ?.addEventListener('change', e => {
      _form.transportDate = e.target.value;
    });
}

function _reset() {
  _form          = null;
  _initialized   = false;
  _editExpenseId = null;
}

/**
 * Rileva il formato dei valori di shares/sharesPaid in modalità "importo".
 * Restituisce:
 *  'cents' — valori in centesimi (formato vecchio: interi grandi × 100)
 *  'euros' — valori in euro     (formato nuovo, garantito da splitMeta)
 *  null    — non è modalità importo (sono quote intere tipo 1, 2, 3…)
 *
 * @param {number[]} values
 * @param {number}   amountCents
 * @param {boolean}  hasSplitMeta  — true = spesa salvata con splitMeta (v66+)
 */
function _detectAmountsValues(values, amountCents, hasSplitMeta = false) {
  if (amountCents <= 0 || values.length === 0) return null;
  const total       = values.reduce((s, v) => s + (v ?? 0), 0);
  const amountEuros = amountCents / 100;
  const allIntegers = values.every(v => Number.isInteger(v));

  // ── Centesimi esatto ────────────────────────────────────────────
  // Tutti interi, sum ≥ 100 (quote reali sono 1–20 max),
  // e la somma corrisponde quasi esattamente ad amountCents.
  if (allIntegers && total >= 100 && Math.abs(total / amountCents - 1) < 0.01) return 'cents';

  // ── Formato euro nuovo (solo con splitMeta) ─────────────────────
  // Il formato euro è stato introdotto con splitMeta (v66+).
  // Senza splitMeta il check euro causerebbe falsi positivi su dati in modalità
  // "quote" in cui la somma coincide per caso con l'importo in euro
  // (es. spesa 3 €, pagatori con quote [1, 2]).
  if (hasSplitMeta) {
    if (total >= 0.005 && Math.abs(total / amountEuros - 1) < 0.02) return 'euros';
    return 'euros'; // default: splitMeta garantisce la modalità, usa euro
  }

  // ── Centesimi fallback legacy (solo senza splitMeta) ────────────
  // Vecchio bug: amountEuro × 100 salvato anche per pagamenti parziali
  // (sum ≠ amountCents). Se i valori sono interi e almeno uno ≥ 100
  // non possono essere quote reali (il stepper parte da 1 e arriva a 20 al massimo).
  if (allIntegers && values.some(v => v >= 100)) return 'cents';

  return null;  // → modalità quote
}

/** @deprecated usa _detectAmountsValues */
function _detectAmountsMode(values, amountCents) {
  return _detectAmountsValues(values, amountCents) !== null;
}

/** Ricostruisce lo stato form da una spesa esistente (edit mode) */
function _formFromExpense(expense, trip) {
  const consumers   = expense.consumers ?? [];
  const payers      = expense.payers    ?? [];
  const amountCents = readAmount(expense);   // centesimi
  const amountEuros = amountCents / 100;
  const splitMeta   = expense.splitMeta ?? null;

  // ── Consumers ──────────────────────────────────────────
  const sharesMap          = {};
  const consumerAmountsMap = {};
  trip.participants.forEach(p => { sharesMap[p.id] = 1; });

  // splitMeta (nuovo) → fonte di verità sul modo; altrimenti auto-detect
  const savedConsumerMode  = splitMeta?.consumerMode ?? null;
  const consumerValues     = consumers.map(c => c.shares ?? 1);
  let   consumersInAmounts = false;
  let   consumerFmt        = null;

  if (savedConsumerMode === 'amounts') {
    consumersInAmounts = true;
    consumerFmt        = _detectAmountsValues(consumerValues, amountCents, true);
  } else if (!savedConsumerMode) {
    // Spesa vecchia senza splitMeta — auto-detect con fallback legacy
    consumerFmt        = _detectAmountsValues(consumerValues, amountCents, false);
    consumersInAmounts = consumerFmt !== null;
  }

  // Ripristina consumerPercentMap (modalità percent)
  const consumerPercentMap = {};
  if (savedConsumerMode === 'percent') {
    // Le shares sono già percentuali (salvate come tali in _buildConsumers)
    const totalPct = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
    consumers.forEach(c => {
      // Normalizza a 100 nel caso in cui ci sia uno scarto di arrotondamento
      consumerPercentMap[c.participantId] = totalPct > 0
        ? Math.round(((c.shares ?? 0) / totalPct * 100) * 10) / 10
        : 0;
    });
  }

  if (consumersInAmounts) {
    consumers.forEach(c => {
      const v = c.shares ?? 0;
      consumerAmountsMap[c.participantId] = consumerFmt === 'cents' ? v / 100 : v;
    });
  } else if (savedConsumerMode !== 'percent') {
    consumers.forEach(c => {
      sharesMap[c.participantId] = Math.max(1, c.shares ?? 1);
    });
  }

  // ── Payers ─────────────────────────────────────────────
  const payerSharesMap  = {};
  const payerAmountsMap = {};

  const savedPayerMode  = splitMeta?.payerMode ?? null;
  const payerValues     = payers.map(p => p.sharesPaid ?? 1);
  let   payersInAmounts = false;
  let   payerFmt        = null;

  if (savedPayerMode === 'amounts') {
    payersInAmounts = true;
    payerFmt        = _detectAmountsValues(payerValues, amountCents, true);
  } else if (!savedPayerMode) {
    // Spesa vecchia senza splitMeta — auto-detect con fallback legacy
    payerFmt        = _detectAmountsValues(payerValues, amountCents, false);
    payersInAmounts = payerFmt !== null;
  }

  if (payersInAmounts) {
    payers.forEach(p => {
      const v = p.sharesPaid ?? 0;
      payerAmountsMap[p.participantId] = payerFmt === 'cents' ? v / 100 : v;
    });
  } else {
    payers.forEach(p => {
      payerSharesMap[p.participantId] = Math.max(1, p.sharesPaid ?? 1);
    });
  }

  // consumerMode: se splitMeta è presente usa quello, altrimenti inferisce
  const consumerMode = consumersInAmounts
    ? 'amounts'
    : (savedConsumerMode === 'percent' ? 'percent' : (savedConsumerMode ?? 'shares'));

  // Ricostruisce payerPaidMap da expense salvata
  const payerPaidMap = {};
  payers.forEach(p => { payerPaidMap[p.participantId] = p.paid !== false; });

  // Ricostruisce guestMap, guestPayerMap, giftMap (modalità guests)
  const guestMap      = {};
  const guestPayerMap = {};
  const giftMap       = {};
  if (splitMeta?.payerMode === 'guests' && expense.splitMeta?.guests) {
    for (const g of (expense.splitMeta.guests ?? [])) {
      guestMap[g.guestId]      = true;
      // Compatibilità con vecchio formato { payerId } e nuovo { payerIds[] }
      guestPayerMap[g.guestId] = g.payerIds ?? (g.payerId ? [g.payerId] : []);
      if (g.gift) giftMap[g.guestId] = true;
    }
    // Ripristina gli importi effettivamente versati da splitMeta.payerAmounts
    // (salvati separatamente per distinguerli dalla quota teorica)
    if (splitMeta.payerAmounts) {
      for (const [pid, amt] of Object.entries(splitMeta.payerAmounts)) {
        if (amt != null && amt > 0) payerAmountsMap[pid] = amt;
      }
    } else {
      // Fallback per spese salvate prima di v84: usa sharesPaid come importo versato
      // (potrebbe essere la quota teorica, ma è la miglior approssimazione disponibile)
      payers.forEach(p => {
        if (p.sharesPaid > 0) payerAmountsMap[p.participantId] = p.sharesPaid;
      });
    }
  }

  return {
    title:    expense.title,
    amount:   amountEuros,
    category: expense.category ?? 'cibo',
    date:     expense.date,
    notes:    expense.notes ?? '',
    // Consumers
    consumerPreset:     'custom',
    consumerMode,
    consumerPids:       consumers.map(c => c.participantId),
    sharesMap,
    consumerAmountsMap,
    consumerPercentMap,
    // Payers
    payerPids:       payers.map(p => p.participantId),
    payerSharesMap,
    payerMode:       savedPayerMode === 'guests' ? 'guests'
                   : payersInAmounts ? 'amounts'
                   : (savedPayerMode ?? 'shares'),
    payerAmountsMap,
    payerPaidMap,
    guestMap,
    guestPayerMap,
    giftMap,
    // Transport (mai pre-compilato in edit mode)
    transportSync:  false,
    transportType:  'andata',
    transportDate:  null,
  };
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}
