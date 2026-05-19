/* =====================================================
   CAMBUSA — recurringManager.js
   Gestione spese ricorrenti.

   FLUSSO
   ─────────────────────────────────────────────────────
   Lista template → Genera spesa (se in scadenza)
                  → Aggiungi / Modifica / Elimina template
   ===================================================== */

import { State }   from '../state.js';
import { Actions } from '../actions.js';
import { Router }  from '../router.js';
import { Topbar }  from '../ui.js';
import { Toast }   from '../toast.js';
import { today }   from '../domain/normalize.js';
import {
  RECURRENCE_OPTIONS,
  recurrenceLabel,
  nextDueDate,
  isDue,
  dueDateLabel,
} from '../domain/recurrence.js';
import { catIcon } from '../components/catIcon.js';

const CAT_OPTIONS = [
  { id: 'alloggio',  label: 'Alloggio'   },
  { id: 'trasporti', label: 'Trasporti'  },
  { id: 'cibo',      label: 'Cibo'       },
  { id: 'spesa',     label: 'Spesa'      },
  { id: 'servizi',   label: 'Servizi'    },
  { id: 'attivita',  label: 'Attività'   },
  { id: 'noleggi',   label: 'Noleggi'    },
  { id: 'altro',     label: 'Altro'      },
];

// ── Stato modulo ──────────────────────────────────────
let _showForm  = false;
let _editId    = null;
let _form      = null;

function _emptyForm() {
  return {
    title:        '',
    category:     'altro',
    amountCents:  0,
    recurrence:   'monthly',
    consumerPids: [],   // [] = tutti
    payerId:      null,
    startDate:    today(),
    active:       true,
  };
}

function _reset() {
  _showForm = false;
  _editId   = null;
  _form     = null;
}

// ── Helpers ───────────────────────────────────────────
function _h(s)   { return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmt(c) { return (c / 100).toFixed(2).replace('.', ','); }

// ── Render template card ──────────────────────────────
function _renderTemplate(t, trip) {
  const due      = isDue(t);
  const label    = dueDateLabel(t);
  const inactive = t.active === false;
  const cur      = trip.currency ?? '€';

  const consumerNames = t.consumerPids?.length
    ? t.consumerPids.map(pid => trip.participants.find(p => p.id === pid)?.name?.split(' ')[0] ?? '?').join(', ')
    : 'Tutti';
  const payerName = trip.participants.find(p => p.id === t.payerId)?.name?.split(' ')[0] ?? '—';

  return `
    <div class="rm-card ${due && !inactive ? 'rm-card--due' : ''} ${inactive ? 'rm-card--inactive' : ''}">
      <div class="rm-card__header">
        <div class="rm-card__info">
          <strong class="rm-card__title">${_h(t.title)}</strong>
          <span class="rm-card__recurrence">${recurrenceLabel(t.recurrence)}</span>
        </div>
        <span class="rm-card__amount">${cur} ${_fmt(t.amountCents)}</span>
      </div>
      <div class="rm-card__meta">
        <span>👥 ${_h(consumerNames)}</span>
        <span>💳 ${_h(payerName)}</span>
        <span class="rm-card__due ${due && !inactive ? 'rm-card__due--alert' : ''}">
          📅 ${label}
        </span>
      </div>
      <div class="rm-card__actions">
        ${due && !inactive ? `
          <button class="btn-primary rm-btn-generate" data-gen-id="${t.id}">
            ✓ Genera spesa
          </button>` : ''}
        <button class="rm-btn-edit" data-edit-id="${t.id}">Modifica</button>
        <button class="rm-btn-toggle" data-toggle-id="${t.id}">
          ${inactive ? '▶ Riattiva' : '⏸ Pausa'}
        </button>
        <button class="rm-btn-delete" data-del-id="${t.id}">🗑</button>
      </div>
    </div>`;
}

// ── Render form ───────────────────────────────────────
function _renderForm(trip) {
  const f    = _form;
  const ppts = trip.participants ?? [];

  const catChips = CAT_OPTIONS.map(c => `
    <button class="filter-chip ${f.category === c.id ? 'filter-chip--active' : ''}"
            data-rm-cat="${c.id}">${catIcon(c.id, 16)} ${c.label}</button>`).join('');

  const recChips = RECURRENCE_OPTIONS.map(r => `
    <button class="filter-chip ${f.recurrence === r.id ? 'filter-chip--active' : ''}"
            data-rm-rec="${r.id}">${r.icon} ${r.label}</button>`).join('');

  const consumerChips = ppts.map(p => {
    const active = f.consumerPids.length === 0 || f.consumerPids.includes(p.id);
    return `<button class="filter-chip ${active ? 'filter-chip--active' : ''}"
                    data-rm-consumer="${p.id}">${_h(p.name.split(' ')[0])}</button>`;
  }).join('');

  const payerChips = ppts.map(p => `
    <button class="filter-chip ${f.payerId === p.id ? 'filter-chip--active' : ''}"
            data-rm-payer="${p.id}">${_h(p.name.split(' ')[0])}</button>`).join('');

  const canSave = f.title.trim() && f.amountCents > 0 && f.payerId;

  return `
    <div class="rm-form card" id="rm-form">
      <h3 class="rm-form__title">${_editId ? 'Modifica ricorrente' : 'Nuova spesa ricorrente'}</h3>

      <label class="field-label">Titolo *</label>
      <input class="input" id="rm-f-title" type="text"
             value="${_h(f.title)}" placeholder="es. Affitto, Bolletta gas…" />

      <label class="field-label" style="margin-top:12px">Importo *</label>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;color:var(--color-text-sub)">${trip.currency ?? '€'}</span>
        <input class="input" id="rm-f-amount" type="number" min="0" step="0.01"
               inputmode="decimal"
               value="${f.amountCents > 0 ? (f.amountCents / 100).toFixed(2) : ''}"
               placeholder="0,00" style="flex:1" />
      </div>

      <label class="field-label" style="margin-top:12px">Categoria</label>
      <div class="filter-row">${catChips}</div>

      <label class="field-label" style="margin-top:12px">Frequenza *</label>
      <div class="filter-row">${recChips}</div>

      <label class="field-label" style="margin-top:12px">Data inizio</label>
      <input class="input" id="rm-f-start" type="date" value="${f.startDate}" />

      <label class="field-label" style="margin-top:12px">Chi consuma</label>
      <p class="field-hint">Lascia selezionati tutti o scegli un sottoinsieme.</p>
      <div class="filter-row">${consumerChips}</div>

      <label class="field-label" style="margin-top:12px">Chi paga *</label>
      <div class="filter-row">${payerChips}</div>

      <div class="rm-form__buttons">
        <button class="btn-primary" id="rm-save-btn" ${canSave ? '' : 'disabled'}>
          ${_editId ? 'Salva modifiche' : 'Aggiungi ricorrente'}
        </button>
        <button class="btn-secondary" id="rm-cancel-btn">Annulla</button>
      </div>
    </div>`;
}

// ── Screen HTML ───────────────────────────────────────
export const RecurringManagerScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Evento non trovato.</p>';

    const templates = trip.recurringTemplates ?? [];
    const pending   = templates.filter(t => t.active !== false && isDue(t));

    const listHtml = templates.length
      ? templates.map(t => _renderTemplate(t, trip)).join('')
      : `<p class="field-hint" style="padding:16px 0">
           Nessuna spesa ricorrente. Aggiungine una con il pulsante sotto.
         </p>`;

    return `
      <div class="screen" id="screen-recurring">
        ${Topbar({
          title:    'Spese ricorrenti',
          subtitle: trip.name,
          back:     true,
          backNav:  'trip',
        })}
        <main class="screen-content">

          ${pending.length ? `
            <div class="rm-pending-banner">
              📅 ${pending.length} ${pending.length === 1 ? 'spesa in scadenza' : 'spese in scadenza'}
              — genera le spese qui sotto
            </div>` : ''}

          <div id="rm-list">
            ${listHtml}
          </div>

          ${_showForm ? _renderForm(trip) : ''}

          ${!_showForm ? `
            <button class="btn-primary rm-add-btn" id="rm-add-btn">
              + Aggiungi spesa ricorrente
            </button>` : ''}

        </main>
      </div>`;
  },

  mount() {
    const screen = document.getElementById('screen-recurring');
    if (!screen) return;

    screen.addEventListener('click',  _onClick);
    screen.addEventListener('input',  _onInput);
    screen.addEventListener('change', _onChange);
  },

  unmount() {
    const screen = document.getElementById('screen-recurring');
    if (screen) {
      screen.removeEventListener('click',  _onClick);
      screen.removeEventListener('input',  _onInput);
      screen.removeEventListener('change', _onChange);
    }
    _reset();
  },
};

// ── Re-render helpers ─────────────────────────────────
function _rerender() {
  const trip = State.currentTrip;
  if (!trip) return;

  const templates = trip.recurringTemplates ?? [];
  const listEl    = document.getElementById('rm-list');
  const formEl    = document.getElementById('rm-form');
  const addBtn    = document.getElementById('rm-add-btn');

  if (listEl) {
    listEl.innerHTML = templates.length
      ? templates.map(t => _renderTemplate(t, trip)).join('')
      : `<p class="field-hint" style="padding:16px 0">
           Nessuna spesa ricorrente. Aggiungine una con il pulsante sotto.
         </p>`;
  }

  // Pending banner
  const pending = templates.filter(t => t.active !== false && isDue(t));
  const existing = document.querySelector('.rm-pending-banner');
  const main = document.querySelector('#screen-recurring .screen-content');
  if (pending.length && !existing && main) {
    const banner = document.createElement('div');
    banner.className = 'rm-pending-banner';
    banner.textContent = `📅 ${pending.length} ${pending.length === 1 ? 'spesa in scadenza' : 'spese in scadenza'} — genera le spese qui sotto`;
    main.insertBefore(banner, main.firstChild);
  } else if (!pending.length && existing) {
    existing.remove();
  }

  if (_showForm) {
    if (!formEl) {
      const div = document.createElement('div');
      div.innerHTML = _renderForm(trip);
      const btn = document.getElementById('rm-add-btn');
      if (btn) btn.before(div.firstElementChild);
      else main?.appendChild(div.firstElementChild);
    } else {
      formEl.outerHTML = _renderForm(trip);
    }
    if (addBtn) addBtn.style.display = 'none';
  } else {
    if (formEl) formEl.remove();
    if (addBtn) addBtn.style.display = '';
  }
}

function _syncFormField() {
  _form.title      = document.getElementById('rm-f-title')?.value  ?? _form.title;
  const amt = parseFloat(document.getElementById('rm-f-amount')?.value ?? '0');
  _form.amountCents = Math.round((isNaN(amt) ? 0 : amt) * 100);
  _form.startDate  = document.getElementById('rm-f-start')?.value  ?? _form.startDate;
}

function _rerenderFormButtons() {
  const btn = document.getElementById('rm-save-btn');
  if (!btn) return;
  const canSave = _form.title.trim() && _form.amountCents > 0 && _form.payerId;
  btn.disabled = !canSave;
}

// ── Click handler ─────────────────────────────────────
async function _onClick(e) {
  const trip = State.currentTrip;
  if (!trip) return;

  // Back
  if (e.target.closest('.btn-back')) {
    Router.go('trip', { tripId: trip.id });
    return;
  }

  // Apri form nuovo
  if (e.target.closest('#rm-add-btn')) {
    _showForm = true;
    _editId   = null;
    _form     = _emptyForm();
    _rerender();
    setTimeout(() => document.getElementById('rm-f-title')?.focus(), 50);
    return;
  }

  // Annulla
  if (e.target.closest('#rm-cancel-btn')) {
    _showForm = false;
    _editId   = null;
    _form     = null;
    _rerender();
    return;
  }

  // Salva
  if (e.target.closest('#rm-save-btn')) {
    _syncFormField();
    if (!_form.title.trim())    { Toast.show('Inserisci un titolo', { type: 'info' }); return; }
    if (_form.amountCents <= 0) { Toast.show('Inserisci un importo valido', { type: 'info' }); return; }
    if (!_form.payerId)         { Toast.show('Seleziona chi paga', { type: 'info' }); return; }

    const templateData = {
      title:        _form.title.trim(),
      category:     _form.category,
      amountCents:  _form.amountCents,
      recurrence:   _form.recurrence,
      consumerPids: _form.consumerPids,
      payerId:      _form.payerId,
      startDate:    _form.startDate,
      active:       true,
    };

    let result;
    if (_editId) {
      result = await Actions.updateRecurringTemplate(trip.id, _editId, templateData);
    } else {
      result = await Actions.addRecurringTemplate(trip.id, templateData);
    }

    if (!result?.ok) {
      Toast.show('Errore nel salvataggio', { type: 'error' });
      return;
    }

    Toast.show(_editId ? 'Ricorrente aggiornata' : 'Ricorrente aggiunta ✓', { type: 'success' });
    _showForm = false;
    _editId   = null;
    _form     = null;
    _rerender();
    return;
  }

  // Categoria
  const catBtn = e.target.closest('[data-rm-cat]');
  if (catBtn && _form) {
    _form.category = catBtn.dataset.rmCat;
    document.querySelectorAll('[data-rm-cat]').forEach(b =>
      b.classList.toggle('filter-chip--active', b.dataset.rmCat === _form.category));
    return;
  }

  // Ricorrenza
  const recBtn = e.target.closest('[data-rm-rec]');
  if (recBtn && _form) {
    _form.recurrence = recBtn.dataset.rmRec;
    document.querySelectorAll('[data-rm-rec]').forEach(b =>
      b.classList.toggle('filter-chip--active', b.dataset.rmRec === _form.recurrence));
    return;
  }

  // Consumer chip
  const consBtn = e.target.closest('[data-rm-consumer]');
  if (consBtn && _form) {
    _syncFormField();
    const pid = consBtn.dataset.rmConsumer;
    const all = trip.participants.map(p => p.id);

    // Se tutti selezionati e clicco uno → seleziono solo quello
    if (_form.consumerPids.length === 0) {
      _form.consumerPids = all.filter(id => id !== pid);
    } else if (_form.consumerPids.includes(pid)) {
      _form.consumerPids = _form.consumerPids.filter(id => id !== pid);
      if (_form.consumerPids.length === 0) _form.consumerPids = []; // tutti
    } else {
      _form.consumerPids = [..._form.consumerPids, pid];
      if (_form.consumerPids.length === all.length) _form.consumerPids = []; // tutti
    }

    document.querySelectorAll('[data-rm-consumer]').forEach(b => {
      const isActive = _form.consumerPids.length === 0 || _form.consumerPids.includes(b.dataset.rmConsumer);
      b.classList.toggle('filter-chip--active', isActive);
    });
    return;
  }

  // Pagante
  const payBtn = e.target.closest('[data-rm-payer]');
  if (payBtn && _form) {
    _syncFormField();
    const pid = payBtn.dataset.rmPayer;
    _form.payerId = _form.payerId === pid ? null : pid;
    document.querySelectorAll('[data-rm-payer]').forEach(b =>
      b.classList.toggle('filter-chip--active', b.dataset.rmPayer === _form.payerId));
    _rerenderFormButtons();
    return;
  }

  // Genera spesa
  const genBtn = e.target.closest('[data-gen-id]');
  if (genBtn) {
    const id     = genBtn.dataset.genId;
    const result = await Actions.generateRecurringExpense(trip.id, id);
    if (!result?.ok) {
      Toast.show('Errore nella generazione', { type: 'error' });
      return;
    }
    Toast.show('✓ Spesa generata', { type: 'success' });
    _rerender();
    return;
  }

  // Modifica template
  const editBtn = e.target.closest('[data-edit-id]');
  if (editBtn) {
    const id = editBtn.dataset.editId;
    const t  = (trip.recurringTemplates ?? []).find(t => t.id === id);
    if (!t) return;
    _editId   = id;
    _showForm = true;
    _form = {
      title:        t.title,
      category:     t.category ?? 'altro',
      amountCents:  t.amountCents,
      recurrence:   t.recurrence,
      consumerPids: [...(t.consumerPids ?? [])],
      payerId:      t.payerId,
      startDate:    t.startDate,
      active:       t.active,
    };
    _rerender();
    setTimeout(() => document.getElementById('rm-f-title')?.focus(), 50);
    return;
  }

  // Pausa / Riattiva
  const toggleBtn = e.target.closest('[data-toggle-id]');
  if (toggleBtn) {
    const id = toggleBtn.dataset.toggleId;
    await Actions.toggleRecurringTemplate(trip.id, id);
    _rerender();
    return;
  }

  // Elimina
  const delBtn = e.target.closest('[data-del-id]');
  if (delBtn) {
    const id = delBtn.dataset.delId;
    await Actions.deleteRecurringTemplate(trip.id, id);
    Toast.show('Ricorrente eliminata', { type: 'info' });
    _rerender();
    return;
  }
}

function _onInput(e) {
  if (!_form) return;
  if (e.target.id === 'rm-f-title') {
    _form.title = e.target.value;
    _rerenderFormButtons();
  }
  if (e.target.id === 'rm-f-amount') {
    const v = parseFloat(e.target.value || '0');
    _form.amountCents = Math.round((isNaN(v) ? 0 : v) * 100);
    _rerenderFormButtons();
  }
}

function _onChange(e) {
  if (!_form) return;
  if (e.target.id === 'rm-f-start') {
    _form.startDate = e.target.value;
  }
}
