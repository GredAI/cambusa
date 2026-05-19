/* =====================================================
   CAMBUSA — receiptScanner.js
   Schermata dedicata alla scansione degli scontrini.

   FLUSSO
   ─────────────────────────────────────────────────────
   Phase 1 SCAN    → upload foto → OCR
   Phase 2 ITEMS   → revisione voci (nome, importo)
   Phase 3 ASSIGN  → assegnazione voci a partecipanti
                     + chi ha pagato → crea spesa
   ===================================================== */

import { State }   from '../state.js';
import { Actions } from '../actions.js';
import { Router }  from '../router.js';
import { Topbar }  from '../ui.js';
import { Toast }   from '../toast.js';
import { OCR }     from '../ocr.js';
import { parseReceipt, parseReceiptItems } from '../domain/ocrParser.js';
import { today }   from '../domain/normalize.js';

// ── Stato modulo ──────────────────────────────────────

let _phase              = 'scan';  // 'scan' | 'items' | 'assign'
let _items              = [];       // [{ id, name, amountCents }]
let _assignments        = {};       // itemId → Set<participantId>
let _payerIds           = new Set();
let _title              = '';
let _category           = 'altro';
let _date               = '';
let _detectedTotalCents = null;    // totale rilevato dal testo OCR

function _reset() {
  _phase              = 'scan';
  _items              = [];
  _assignments        = {};
  _payerIds           = new Set();
  _title              = '';
  _category           = 'altro';
  _date               = today();
  _detectedTotalCents = null;
}

// ── Helpers ───────────────────────────────────────────

function _totalCents()  { return _items.reduce((s, i) => s + i.amountCents, 0); }
function _fmt(cents)    { return (cents / 100).toFixed(2).replace('.', ','); }
function _fmtCur(cents) {
  return `${State.currentTrip?.currency ?? '€'} ${_fmt(cents)}`;
}
function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function _participantTotal(pid) {
  return _items.reduce((sum, item) => {
    const asgn = _assignments[item.id];
    if (!asgn?.has(pid)) return sum;
    return sum + Math.round(item.amountCents / asgn.size);
  }, 0);
}
function _assignedCents() {
  return _items.reduce((s, item) => {
    return s + ((_assignments[item.id]?.size ?? 0) > 0 ? item.amountCents : 0);
  }, 0);
}

// ── Phase 1 — SCAN ────────────────────────────────────

function _htmlScan() {
  return `
    <div class="rs-phase" id="rs-phase-scan">
      <div class="rs-hero">
        <div class="rs-icon">📷</div>
        <h2 class="rs-title">Scansiona scontrino</h2>
        <p class="rs-sub">Scatta o carica una foto — le voci vengono rilevate automaticamente</p>
      </div>

      <label class="rs-upload-btn" id="rs-upload-label">
        <span>📸 Apri fotocamera / Scegli foto</span>
        <input type="file" id="rs-file-input" accept="image/*" capture="environment"
               style="display:none" />
      </label>

      <div class="rs-progress-wrap" id="rs-progress-wrap" style="display:none">
        <div class="rs-progress-bar">
          <div class="rs-progress-fill" id="rs-progress-fill" style="width:0%"></div>
        </div>
        <p class="rs-progress-label" id="rs-progress-label">Analisi in corso…</p>
      </div>

      <button class="rs-link-btn" id="rs-manual-btn">
        ✍️ Inserisci voci manualmente
      </button>
    </div>`;
}

// ── Phase 2 — ITEMS ───────────────────────────────────

function _renderItemsList() {
  const cur = State.currentTrip?.currency ?? '€';
  if (!_items.length) {
    return '<p class="rs-empty">Nessuna voce — usa il pulsante sotto per aggiungere</p>';
  }
  return _items.map(item => `
    <div class="rs-item-row" data-item-id="${item.id}">
      <input class="rs-item-name" type="text" value="${_esc(item.name)}"
             data-item-name="${item.id}" placeholder="Nome articolo" />
      <div class="rs-item-price-wrap">
        <span class="rs-item-cur">${cur}</span>
        <input class="rs-item-price" type="number" min="0" step="0.01"
               value="${(item.amountCents / 100).toFixed(2)}"
               data-item-price="${item.id}" inputmode="decimal" />
        <button class="rs-item-del" data-item-del="${item.id}" aria-label="Elimina">✕</button>
      </div>
    </div>`).join('');
}

function _renderScanSummary() {
  const itemSum     = _totalCents();
  const hasDetected = _detectedTotalCents !== null;
  const diff        = hasDetected ? _detectedTotalCents - itemSum : 0;
  const diffAbs     = Math.abs(diff);
  const match       = diffAbs <= 2;

  // Riga differenza
  let diffHtml = '';
  if (hasDetected) {
    if (match) {
      diffHtml = `
        <div class="rs-summary-row rs-summary-row--ok">
          <span>Differenza</span>
          <strong>✓ corrisponde</strong>
        </div>`;
    } else {
      const sign  = diff > 0 ? '− ' : '+ ';   // diff>0 → mancano voci; diff<0 → voci in eccesso
      const label = diff > 0 ? 'voci mancanti' : 'voci in eccesso';
      diffHtml = `
        <div class="rs-summary-row rs-summary-row--diff">
          <span>${label}</span>
          <strong>${sign}${_fmtCur(diffAbs)}</strong>
        </div>`;
    }
  }

  return `
    <div class="rs-scan-summary" id="rs-scan-summary">
      <div class="rs-summary-row">
        <span>Voci trovate</span>
        <strong>${_items.length}</strong>
      </div>
      <div class="rs-summary-row">
        <span>Somma voci</span>
        <strong>${_fmtCur(itemSum)}</strong>
      </div>
      ${hasDetected ? `
      <div class="rs-summary-row rs-summary-row--receipt">
        <span>Totale scontrino</span>
        <strong>${_fmtCur(_detectedTotalCents)}</strong>
      </div>` : ''}
      ${diffHtml}
    </div>`;
}

function _htmlItems() {
  const canProceed = _items.length > 0;
  return `
    <div class="rs-phase" id="rs-phase-items">

      <div class="rs-section-label">Nome spesa</div>
      <input class="rs-field" id="rs-title-input" type="text"
             value="${_esc(_title)}" placeholder="es. Cena al ristorante" />

      <div class="rs-section-label" style="margin-top:12px">Data</div>
      <input class="rs-field" id="rs-date-input" type="date" value="${_date}" />

      ${_renderScanSummary()}

      <div class="rs-section-label" style="margin-top:16px">Voci</div>

      <div id="rs-items-list">
        ${_renderItemsList()}
      </div>

      <button class="rs-add-item-btn" id="rs-add-item-btn">+ Aggiungi voce</button>

      <button class="rs-primary-btn" id="rs-items-next-btn" ${canProceed ? '' : 'disabled'}>
        Avanti — Assegna le voci →
      </button>

      <button class="rs-secondary-btn" id="rs-quick-create-btn" ${canProceed ? '' : 'disabled'}>
        Dividi equamente — salta assegnazione
      </button>
    </div>`;
}

// ── Phase 3 — ASSIGN ─────────────────────────────────

function _htmlAssign() {
  const trip         = State.currentTrip;
  const participants = trip?.participants ?? [];
  const cur          = trip?.currency ?? '€';
  const total        = _totalCents();
  const unassigned   = total - _assignedCents();

  // Item cards
  const itemCards = _items.map(item => {
    const asgn     = _assignments[item.id] ?? new Set();
    const allActive = participants.length > 0 && participants.every(p => asgn.has(p.id));
    const chips = participants.map(p => {
      const active = asgn.has(p.id);
      return `<button class="rs-chip ${active ? 'rs-chip--active' : ''}"
                      data-assign-item="${item.id}" data-assign-pid="${p.id}">
                ${_esc(p.name.split(' ')[0])}
              </button>`;
    }).join('');
    return `
      <div class="rs-assign-card">
        <div class="rs-assign-card__header">
          <span class="rs-assign-card__name">${_esc(item.name)}</span>
          <span class="rs-assign-card__price">${cur} ${_fmt(item.amountCents)}</span>
        </div>
        <div class="rs-assign-card__chips">
          ${chips}
          <button class="rs-chip rs-chip--all ${allActive ? 'rs-chip--active' : ''}"
                  data-assign-all="${item.id}">Tutti</button>
        </div>
      </div>`;
  }).join('');

  // Payer chips
  const payerChips = participants.map(p => `
    <button class="rs-chip ${_payerIds.has(p.id) ? 'rs-chip--active' : ''}"
            data-payer-pid="${p.id}">
      ${_esc(p.name.split(' ')[0])}
    </button>`).join('');

  // Totali per partecipante
  const ptotals = participants.map(p => {
    const cents = _participantTotal(p.id);
    return `
      <div class="rs-ptotal ${cents > 0 ? 'rs-ptotal--active' : ''}">
        <span class="rs-ptotal__name">${_esc(p.name.split(' ')[0])}</span>
        <span class="rs-ptotal__amount">${cur} ${_fmt(cents)}</span>
      </div>`;
  }).join('');

  const allAssigned = unassigned <= 0;
  const canCreate   = allAssigned && _payerIds.size > 0;

  return `
    <div class="rs-phase" id="rs-phase-assign">

      <div class="rs-section-label">Chi ha preso cosa?</div>
      ${itemCards}

      ${!allAssigned ? `
        <p class="rs-warn">
          ⚠️ ${_fmtCur(unassigned)} non ancora assegnati
        </p>` : ''}

      <div class="rs-section-label" style="margin-top:20px">Totale per persona</div>
      <div class="rs-ptotals-row">${ptotals}</div>

      <div class="rs-section-label" style="margin-top:20px">Chi ha pagato?</div>
      <div class="rs-chips-row">${payerChips}</div>

      <button class="rs-primary-btn" id="rs-create-btn" ${canCreate ? '' : 'disabled'}>
        ✓ Crea spesa — ${_fmtCur(total)}
      </button>

    </div>`;
}

// ── Phase "quick payer" — salta assegnazione ──────────

function _htmlQuickPayer() {
  const trip         = State.currentTrip;
  const participants = trip?.participants ?? [];
  const total        = _totalCents();
  const cur          = trip?.currency ?? '€';

  const payerChips = participants.map(p => `
    <button class="rs-chip ${_payerIds.has(p.id) ? 'rs-chip--active' : ''}"
            data-payer-pid="${p.id}">
      ${_esc(p.name.split(' ')[0])}
    </button>`).join('');

  const canCreate = _payerIds.size > 0;

  return `
    <div class="rs-phase" id="rs-phase-quick-payer">
      <p class="rs-quick-summary">
        <strong>${_items.length} voci</strong> — ${cur} ${_fmt(total)} divisi equamente tra tutti i partecipanti.
      </p>

      <div class="rs-section-label">Chi ha pagato?</div>
      <div class="rs-chips-row">${payerChips}</div>

      <button class="rs-primary-btn" id="rs-create-btn" ${canCreate ? '' : 'disabled'}>
        ✓ Crea spesa — ${_fmtCur(total)}
      </button>

      <button class="rs-link-btn" id="rs-back-to-items-btn">
        ← Torna alle voci
      </button>
    </div>`;
}

function _goToQuickPayerPhase() {
  _phase = 'quick-payer';
  const main = document.getElementById('rs-main');
  if (main) main.innerHTML = _htmlQuickPayer();
}

function _rerenderQuickPayer() {
  const main = document.getElementById('rs-main');
  if (main && _phase === 'quick-payer') main.innerHTML = _htmlQuickPayer();
}

// ── Transizioni di fase ───────────────────────────────

function _goToItemsPhase() {
  _phase = 'items';
  const main = document.getElementById('rs-main');
  if (main) main.innerHTML = _htmlItems();
}

function _goToAssignPhase() {
  _phase = 'assign';
  const main = document.getElementById('rs-main');
  if (main) main.innerHTML = _htmlAssign();
}

function _rerenderAssign() {
  const main = document.getElementById('rs-main');
  if (main && _phase === 'assign') main.innerHTML = _htmlAssign();
}

function _rerenderItemsList() {
  const list     = document.getElementById('rs-items-list');
  const summary  = document.getElementById('rs-scan-summary');
  const nextBtn  = document.getElementById('rs-items-next-btn');
  const quickBtn = document.getElementById('rs-quick-create-btn');

  if (list)    list.innerHTML    = _renderItemsList();
  if (summary) summary.outerHTML = _renderScanSummary(); // aggiorna conteggio + diff in live
  if (nextBtn)  nextBtn.disabled  = _items.length === 0;
  if (quickBtn) quickBtn.disabled = _items.length === 0;
}

// ── Pre-assegna tutti a tutti ─────────────────────────

function _autoAssignAll() {
  const trip = State.currentTrip;
  if (!trip) return;
  const allIds = new Set(trip.participants.map(p => p.id));
  _assignments = {};
  for (const item of _items) {
    _assignments[item.id] = new Set(allIds);
  }
}

// ── Crea spesa ────────────────────────────────────────

async function _createExpense() {
  const trip = State.currentTrip;
  if (!trip) return;

  if (_payerIds.size === 0) {
    Toast.show('Seleziona chi ha pagato', { type: 'info' });
    return;
  }
  const unassigned = _items.filter(i => !_assignments[i.id]?.size);
  if (unassigned.length) {
    Toast.show(`${unassigned.length} voce non assegnata`, { type: 'info' });
    return;
  }

  const totalCents = _totalCents();
  if (totalCents <= 0) {
    Toast.show('Importo totale non valido', { type: 'error' });
    return;
  }

  // Consumers (amounts mode): somma quote per partecipante
  const ptMap = {};
  for (const item of _items) {
    const asgn = _assignments[item.id];
    if (!asgn?.size) continue;
    const share = Math.round(item.amountCents / asgn.size);
    for (const pid of asgn) {
      ptMap[pid] = (ptMap[pid] ?? 0) + share;
    }
  }
  // Correzione arrotondamento: il totale deve battere esattamente
  const ptIds  = Object.keys(ptMap);
  const sumNow = ptIds.reduce((s, p) => s + ptMap[p], 0);
  if (ptIds.length && sumNow !== totalCents) {
    ptMap[ptIds[0]] += totalCents - sumNow;
  }
  const consumers = ptIds
    .filter(pid => ptMap[pid] > 0)
    .map(pid => ({ participantId: pid, shares: ptMap[pid] }));

  // Payers: divisi equamente (con resto al primo)
  const payerArr = [..._payerIds];
  const perPayer = Math.floor(totalCents / payerArr.length);
  const remainder = totalCents - perPayer * payerArr.length;
  const payers = payerArr.map((pid, idx) => ({
    participantId: pid,
    sharesPaid: perPayer + (idx === 0 ? remainder : 0),
  }));

  const data = {
    title:       _title.trim() || 'Scontrino',
    category:    _category,
    amountCents: totalCents,
    currency:    trip.currency ?? '€',
    date:        _date || today(),
    notes:       '',
    consumers,
    payers,
    splitMeta: {
      consumerMode: 'amounts',
      receiptItems: _items.map(i => ({
        name:        i.name,
        amountCents: i.amountCents,
        assignedTo:  [...(_assignments[i.id] ?? [])],
      })),
    },
  };

  const result = await Actions.createExpense(trip.id, data);
  if (!result.ok) {
    Toast.show('Errore nella creazione della spesa', { type: 'error' });
    return;
  }

  Toast.show(`✓ "${data.title}" aggiunta`, { type: 'success' });
  Router.go('expenses', { tripId: trip.id });
}

// ── Event handlers (delegati a #screen-receipt-scanner) ──

function _onClick(e) {
  const screen = document.getElementById('screen-receipt-scanner');
  if (!screen) return;

  // Back
  if (e.target.closest('.btn-back')) {
    Router.go('expenses', { tripId: State.currentTrip?.id });
    return;
  }

  // ── Phase 1 ───────────────────────────────────────
  if (_phase === 'scan') {
    if (e.target.closest('#rs-manual-btn')) {
      _items = [];
      _date  = today();
      _goToItemsPhase();
    }
    return;
  }

  // ── Phase 2 ───────────────────────────────────────
  if (_phase === 'items') {
    // Elimina voce
    const del = e.target.closest('[data-item-del]');
    if (del) {
      const id = del.dataset.itemDel;
      _items = _items.filter(i => i.id !== id);
      delete _assignments[id];
      _rerenderItemsList();
      return;
    }
    // Aggiungi voce
    if (e.target.closest('#rs-add-item-btn')) {
      const newItem = { id: crypto.randomUUID(), name: '', amountCents: 0 };
      _items.push(newItem);
      _rerenderItemsList();
      setTimeout(() => {
        const inputs = document.querySelectorAll('[data-item-name]');
        inputs[inputs.length - 1]?.focus();
      }, 50);
      return;
    }
    // Sync title + date (comune ad Avanti e shortcut)
    const _syncFields = () => {
      _title = document.getElementById('rs-title-input')?.value?.trim() || _title;
      _date  = document.getElementById('rs-date-input')?.value          || _date;
    };

    // Avanti → Phase 3 (assegnazione completa)
    if (e.target.closest('#rs-items-next-btn')) {
      _syncFields();
      // Rimuove automaticamente le voci senza nome/importo invece di bloccare
      _items = _items.filter(i => i.name.trim() && i.amountCents > 0);
      if (_items.length === 0) {
        Toast.show('Aggiungi almeno una voce con nome e importo', { type: 'info' });
        return;
      }
      _autoAssignAll();
      _goToAssignPhase();
      return;
    }

    // Shortcut: Dividi equamente → mostra solo selezione pagante
    if (e.target.closest('#rs-quick-create-btn')) {
      _syncFields();
      _items = _items.filter(i => i.name.trim() && i.amountCents > 0);
      if (_items.length === 0) {
        Toast.show('Aggiungi almeno una voce con nome e importo', { type: 'info' });
        return;
      }
      _autoAssignAll();
      _goToQuickPayerPhase();
      return;
    }
    return;
  }

  // ── Phase 3 ───────────────────────────────────────
  if (_phase === 'assign') {
    // Assegna articolo a partecipante
    const chip = e.target.closest('[data-assign-item][data-assign-pid]');
    if (chip) {
      const itemId = chip.dataset.assignItem;
      const pid    = chip.dataset.assignPid;
      if (!_assignments[itemId]) _assignments[itemId] = new Set();
      _assignments[itemId].has(pid)
        ? _assignments[itemId].delete(pid)
        : _assignments[itemId].add(pid);
      _rerenderAssign();
      return;
    }
    // Assegna a tutti
    const allBtn = e.target.closest('[data-assign-all]');
    if (allBtn) {
      const itemId = allBtn.dataset.assignAll;
      const trip   = State.currentTrip;
      if (!trip) return;
      const allIds = trip.participants.map(p => p.id);
      if (!_assignments[itemId]) _assignments[itemId] = new Set();
      const allActive = allIds.every(id => _assignments[itemId].has(id));
      _assignments[itemId] = allActive ? new Set() : new Set(allIds);
      _rerenderAssign();
      return;
    }
    // Chi ha pagato
    const payerBtn = e.target.closest('[data-payer-pid]');
    if (payerBtn) {
      const pid = payerBtn.dataset.payerPid;
      _payerIds.has(pid) ? _payerIds.delete(pid) : _payerIds.add(pid);
      _rerenderAssign();
      return;
    }
    // Crea spesa
    if (e.target.closest('#rs-create-btn')) {
      _createExpense();
      return;
    }
  }

  // ── Phase quick-payer ─────────────────────────────
  if (_phase === 'quick-payer') {
    // Selezione pagante
    const payerBtn = e.target.closest('[data-payer-pid]');
    if (payerBtn) {
      const pid = payerBtn.dataset.payerPid;
      _payerIds.has(pid) ? _payerIds.delete(pid) : _payerIds.add(pid);
      _rerenderQuickPayer();
      return;
    }
    // Crea spesa
    if (e.target.closest('#rs-create-btn')) {
      _createExpense();
      return;
    }
    // Torna alle voci
    if (e.target.closest('#rs-back-to-items-btn')) {
      _goToItemsPhase();
      return;
    }
  }
}

function _onInput(e) {
  // Sync nome articolo
  const nameInput = e.target.closest('[data-item-name]');
  if (nameInput) {
    const item = _items.find(i => i.id === nameInput.dataset.itemName);
    if (item) item.name = nameInput.value;
    return;
  }
  // Sync prezzo articolo
  const priceInput = e.target.closest('[data-item-price]');
  if (priceInput) {
    const item = _items.find(i => i.id === priceInput.dataset.itemPrice);
    if (item) {
      item.amountCents = Math.round(parseFloat(priceInput.value || 0) * 100);
      // Aggiorna il summary (somma + differenza) in live
      const summary = document.getElementById('rs-scan-summary');
      if (summary) summary.outerHTML = _renderScanSummary();
    }
    return;
  }
  // Sync titolo
  if (e.target.id === 'rs-title-input') { _title = e.target.value; return; }
  // Sync data
  if (e.target.id === 'rs-date-input')  { _date  = e.target.value; return; }
}

async function _onChange(e) {
  if (e.target.id !== 'rs-file-input') return;
  const file = e.target.files?.[0];
  if (!file) return;

  // Mostra progressione
  document.getElementById('rs-progress-wrap').style.display  = 'block';
  document.getElementById('rs-upload-label').style.display   = 'none';
  document.getElementById('rs-manual-btn').style.display     = 'none';

  try {
    const text = await OCR.recognize(file, pct => {
      const fill  = document.getElementById('rs-progress-fill');
      const label = document.getElementById('rs-progress-label');
      if (fill)  fill.style.width    = pct + '%';
      if (label) label.textContent   = `Analisi in corso… ${pct}%`;
    });
    const parsed        = parseReceipt(text);
    _title              = parsed.title    ?? '';
    _category           = parsed.category ?? 'altro';
    _detectedTotalCents = parsed.totalCents ?? null;
    // Passa il totale rilevato per escludere la riga totale dagli articoli
    _items              = parseReceiptItems(text, _detectedTotalCents);
    _date               = today();

    if (_items.length === 0) {
      Toast.show('Nessuna voce rilevata — aggiungi manualmente', { type: 'info' });
    }
    _autoAssignAll();
    _goToItemsPhase();
  } catch {
    Toast.show('Errore OCR — prova con una foto più nitida', { type: 'error' });
    document.getElementById('rs-progress-wrap').style.display = 'none';
    document.getElementById('rs-upload-label').style.display  = 'block';
    document.getElementById('rs-manual-btn').style.display    = 'block';
  }
}

// ── Screen export ─────────────────────────────────────

export const ReceiptScannerScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Viaggio non trovato.</p>';
    _reset();
    return `
      <div class="screen" id="screen-receipt-scanner">
        ${Topbar({
          title:    'Scontrino',
          subtitle: trip.name,
          back:     true,
          backNav:  'expenses',
        })}
        <main class="screen-content rs-container" id="rs-main">
          ${_htmlScan()}
        </main>
      </div>`;
  },

  mount() {
    const screen = document.getElementById('screen-receipt-scanner');
    if (!screen) return;
    screen.addEventListener('click',  _onClick);
    screen.addEventListener('input',  _onInput);
    screen.addEventListener('change', _onChange);
  },

  unmount() {
    const screen = document.getElementById('screen-receipt-scanner');
    if (screen) {
      screen.removeEventListener('click',  _onClick);
      screen.removeEventListener('input',  _onInput);
      screen.removeEventListener('change', _onChange);
    }
    _reset();
  },
};
