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
import { readAmount } from '../domain/guards.js';
import { participantAvatar } from '../components/avatar.js';
import { OCR }        from '../ocr.js';
import { parseReceipt } from '../domain/ocrParser.js';

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
    consumerMode:        'shares',  // 'equal' | 'shares' | 'amounts'
    consumerPids:        trip.participants.map(p => p.id),
    sharesMap,
    consumerAmountsMap:  {},        // { pid: euroAmount } — usato solo in mode 'amounts'
    // Payers
    payerPids:        firstPid ? [firstPid] : [],
    payerSharesMap,
    payerMode:        'shares',   // 'shares' | 'amounts'
    payerAmountsMap:  {},         // { pid: euroAmount }
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
  const totalShares = _calcConsumerShares();

  // Summary dinamico per modalità
  let summaryHtml;
  if (isAmounts) {
    const { text, cls } = _consumerBalanceInfo(trip);
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
    </div>

    <div class="split-mode-toggle" id="consumer-mode">
      <button class="split-mode-btn ${mode === 'equal'   ? 'split-mode-btn--active' : ''}"
              data-cmode="equal">= Uguale</button>
      <button class="split-mode-btn ${mode === 'shares'  ? 'split-mode-btn--active' : ''}"
              data-cmode="shares">⚖ Quote</button>
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
  const shares     = _form.sharesMap[p.id] ?? 1;

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

  // Summary per modalità importo
  let summaryHtml = '';
  if (payerMode === 'amounts') {
    const { text, cls } = _payerBalanceInfo(trip);
    summaryHtml = `<span class="section-sub ${cls}" id="payer-summary">${text}</span>`;
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
    </div>

    <div id="payer-rows">
      ${trip.participants.map(p => _renderPayerRow(p, multiPayer, payerMode, trip)).join('')}
    </div>`;
}

function _renderPayerRow(p, multiPayer, payerMode, trip) {
  const isPayer    = _form.payerPids.includes(p.id);
  const sharesPaid = _form.payerSharesMap[p.id] ?? 1;

  if (payerMode === 'amounts') {
    const amtVal = isPayer && _form.payerAmountsMap[p.id] != null
      ? _form.payerAmountsMap[p.id]
      : '';
    return `
      <div class="split-row ${!isPayer ? 'split-row--off' : ''}">
        <button class="split-toggle ${isPayer ? 'split-toggle--on' : ''}"
                data-ptoggle="${p.id}">
          ${participantAvatar(p, 'avatar--sm')}
          <span class="split-row__name">${p.name}</span>
          ${isPayer ? '<span class="split-check">✓</span>' : ''}
        </button>
        ${isPayer ? `
          <div class="payer-amt-wrap">
            <span class="payer-amt-currency">${trip.currency}</span>
            <input class="payer-amt-input" type="number" inputmode="decimal"
                   data-pamt="${p.id}" placeholder="0.00"
                   value="${amtVal}" min="0" step="0.01" />
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
  if (diff > 0) return { text: `Mancano ${diff.toFixed(2)}${cur}`, cls: 'text-negative' };
  return { text: `Eccesso ${(-diff).toFixed(2)}${cur}`, cls: 'text-negative' };
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
      } else {
        if (_form.consumerPids.length <= 1) return;
        _form.consumerPids.splice(idx, 1);
        delete _form.consumerAmountsMap[pid];
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
      _form.payerMode = btn.dataset.pmode;
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
        // In amounts mode: pre-compila con l'importo rimanente
        if (_form.payerMode === 'amounts') {
          const total    = parseFloat(_form.amount) || 0;
          const already  = _form.payerPids
            .filter(p => p !== pid)
            .reduce((s, p) => s + (parseFloat(_form.payerAmountsMap[p]) || 0), 0);
          _form.payerAmountsMap[pid] = Math.max(0, parseFloat((total - already).toFixed(2)));
        }
      } else {
        if (_form.payerPids.length <= 1) return; // almeno 1 payer
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

  // Input importo diretto (modalità amounts)
  document.getElementById('payer-rows')
    ?.addEventListener('input', e => {
      const input = e.target.closest('[data-pamt]');
      if (!input) return;
      const pid = input.dataset.pamt;
      _form.payerAmountsMap[pid] = parseFloat(input.value) || 0;
      _refreshPayerSummary(trip);
    });
}

function _refreshPayerSummary(trip) {
  if (_form.payerMode !== 'amounts') return;
  const el = document.getElementById('payer-summary');
  if (!el) return;
  const { text, cls } = _payerBalanceInfo(trip);
  el.textContent = text;
  el.className   = `section-sub ${cls}`;
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

  // Validazione modalità importo esatto: la somma deve corrispondere all'importo
  if (_form.consumerMode === 'amounts') {
    const assigned = _form.consumerPids.reduce(
      (s, pid) => s + (parseFloat(_form.consumerAmountsMap[pid]) || 0), 0);
    const diff = Math.abs(amount - assigned);
    if (diff >= 0.01) {
      const trip = State.currentTrip;
      const cur  = trip?.currency ?? '€';
      const msg  = amount > assigned
        ? `Mancano ${(amount - assigned).toFixed(2)}${cur} da assegnare`
        : `Importi in eccesso di ${(assigned - amount).toFixed(2)}${cur}`;
      return Toast.show(msg, { type: 'error' });
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

  const dest = _editExpenseId ? 'expenses' : 'trip';
  _reset();
  Router.go(dest, { tripId: trip.id });
}

// ── Helpers ───────────────────────────────────────────

function _buildConsumers() {
  if (_form.consumerMode === 'amounts') {
    // Converte importi in centesimi come peso proporzionale
    return _form.consumerPids.map(pid => ({
      participantId: pid,
      shares: Math.round((_form.consumerAmountsMap[pid] ?? 0) * 100) || 1,
    }));
  }
  return _form.consumerPids.map(pid => ({
    participantId: pid,
    shares: _form.consumerMode === 'equal' ? 1 : (_form.sharesMap[pid] ?? 1),
  }));
}

function _buildPayers() {
  if (_form.payerMode === 'amounts') {
    // Usa gli importi in euro come peso proporzionale (×100 per precisione)
    return _form.payerPids.map(pid => ({
      participantId: pid,
      sharesPaid: Math.round((_form.payerAmountsMap[pid] ?? 0) * 100) || 1,
    }));
  }
  return _form.payerPids.map(pid => ({
    participantId: pid,
    sharesPaid: _form.payerSharesMap[pid] ?? 1,
  }));
}

function _calcConsumerShares() {
  if (_form.consumerMode === 'equal') return _form.consumerPids.length;
  return _form.consumerPids.reduce((s, pid) => s + (_form.sharesMap[pid] ?? 1), 0);
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

/** Ricostruisce lo stato form da una spesa esistente (edit mode) */
function _formFromExpense(expense, trip) {
  const consumers = expense.consumers ?? [];
  const payers    = expense.payers    ?? [];

  const sharesMap      = {};
  const payerSharesMap = {};

  // Inizializza tutti i partecipanti con shares=1 di default
  trip.participants.forEach(p => { sharesMap[p.id] = 1; });

  // Sovrascrivi con le shares effettive dei consumers
  consumers.forEach(c => {
    sharesMap[c.participantId] = Math.max(1, c.shares ?? 1);
  });

  // Payers
  payers.forEach(p => {
    payerSharesMap[p.participantId] = Math.max(1, p.sharesPaid ?? 1);
  });

  return {
    title:          expense.title,
    amount:         readAmount(expense) / 100,
    category:       expense.category ?? 'cibo',
    date:           expense.date,
    notes:          expense.notes ?? '',
    // Consumers
    consumerPreset:     'custom',
    consumerMode:       'shares',
    consumerPids:       consumers.map(c => c.participantId),
    sharesMap,
    consumerAmountsMap: {},
    // Payers
    payerPids:        payers.map(p => p.participantId),
    payerSharesMap,
    payerMode:        'shares',
    payerAmountsMap:  {},
    // Transport (mai pre-compilato in edit mode — l'utente sceglie di nuovo)
    transportSync:  false,
    transportType:  'andata',
    transportDate:  null,
  };
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}
