/* =====================================================
   CAMBUSA — tripForm.js
   Schermata unificata Create / Edit viaggio.

   MODALITÀ
   ─────────────────────────────────────────────────────
   mode: 'create'  → campi vuoti, save → Actions.createTrip()
   mode: 'edit'    → pre-popolata da currentTrip, save → Actions.updateTrip()

   DRAFT STATE
   ─────────────────────────────────────────────────────
   Non si modifica mai il trip originale direttamente.
   _draft è un clone isolato. Solo Actions.save() scrive.

   PROGRESSIVE DISCLOSURE
   ─────────────────────────────────────────────────────
   Partecipante compatto → tap → editor inline
   Shares e presenze parziali dentro <details>
   ===================================================== */

import { State }   from '../state.js';
import { Actions } from '../actions.js';
import { Router }  from '../router.js';
import { Topbar }  from '../ui.js';
import { Toast }   from '../toast.js';
import { Modal }   from '../ui/modal.js';
import { participantAvatar, updateAvatarEl } from '../components/avatar.js';
import { TRIP_TYPES, tripTypeInfo } from '../domain/tripType.js';

const CURRENCIES = ['€', '$', '£', 'CHF'];
const COLORS     = ['#10b981','#3b82f6','#f97316','#8b5cf6','#ef4444','#eab308','#06b6d4','#ec4899'];

// ── Stato modulo ──────────────────────────────────────
let _mode        = 'create';
let _original    = null;
let _draft       = _emptyDraft();
let _expandedPid = null;
let _expandedGid = null;
let _isDirty     = false;
let _initialized = false;

function _emptyDraft() {
  return { name: '', location: '', startDate: '', endDate: '', currency: '€', type: 'viaggio', participants: [], groups: [] };
}

function _cloneTrip(trip) {
  return {
    name:         trip.name,
    location:     trip.location ?? '',
    startDate:    trip.startDate,
    endDate:      trip.endDate,
    currency:     trip.currency,
    type:         trip.type ?? 'viaggio',
    participants: trip.participants.map(p => ({ ...p })),
    groups:       (trip.groups ?? []).map(g => ({ ...g, members: [...(g.members ?? [])] })),
  };
}

// ── Screen ────────────────────────────────────────────
export const TripFormScreen = {

  html() {
    // Inizializza solo al primo render del lifecycle
    if (!_initialized) {
      _mode     = State.params.mode ?? 'create';
      _original = _mode === 'edit' ? State.currentTrip : null;
      if (_mode === 'edit' && _original) {
        _draft    = _cloneTrip(_original);
        _colorIdx = _draft.participants.length;  // evita colori duplicati
      }
      _initialized = true;
    }

    const isEdit  = _mode === 'edit';
    const typeInfo = tripTypeInfo(_draft.type);

    return `
      <div class="screen" id="screen-trip-form">
        ${Topbar({ title: isEdit ? `Modifica ${typeInfo.label}` : `Nuovo ${typeInfo.label}`, back: true })}

        <main class="screen-content">

          <!-- Tipo evento -->
          <div class="card">
            <label class="field-label">Tipo</label>
            <div class="filter-row" id="type-row">
              ${TRIP_TYPES.map(t => `
                <button class="filter-chip ${_draft.type === t.id ? 'filter-chip--active' : ''}"
                        data-type="${t.id}">${t.icon} ${t.label}</button>`).join('')}
            </div>
          </div>

          <!-- Nome + luogo -->
          <div class="card">
            <label class="field-label">Nome ${typeInfo.label} *</label>
            <input id="f-name" class="input" type="text"
                   placeholder="es. ${typeInfo.icon} ${typeInfo.label} 2026" value="${_h(_draft.name)}" />
            <label class="field-label">Luogo</label>
            <input id="f-location" class="input" type="text"
                   placeholder="es. Creta" value="${_h(_draft.location)}" style="margin-bottom:0" />
          </div>

          <!-- Date -->
          <div class="card">
            <label class="field-label">Date *</label>
            <div class="date-row">
              <div class="date-field">
                <span class="date-field__label">Dal</span>
                <input id="f-start" class="input input--date" type="date" value="${_draft.startDate}" />
              </div>
              <span class="date-sep">→</span>
              <div class="date-field">
                <span class="date-field__label">Al</span>
                <input id="f-end" class="input input--date" type="date" value="${_draft.endDate}" />
              </div>
            </div>
          </div>

          <!-- Valuta -->
          <div class="card">
            <label class="field-label">Valuta</label>
            <div class="currency-row" id="currency-row">
              ${CURRENCIES.map(c => `
                <button class="filter-chip ${_draft.currency === c ? 'filter-chip--active' : ''}"
                        data-currency="${c}">${c}</button>`).join('')}
            </div>
          </div>

          <!-- Partecipanti -->
          <div class="card" id="card-participants">
            <div class="section-header">
              <label class="field-label" style="margin:0">Partecipanti *</label>
              <span class="section-sub" id="p-count">
                ${_draft.participants.length > 0 ? _draft.participants.length : 'nessuno'}
              </span>
            </div>

            <div id="participants-list">
              ${_renderParticipants()}
            </div>

            <div class="add-participant-row">
              <input id="f-p-name" class="input" type="text"
                     placeholder="Aggiungi partecipante…" />
              <button class="btn-add" id="btn-add-p" aria-label="Aggiungi">+</button>
            </div>
          </div>

          <!-- Gruppi -->
          <div class="card" id="card-groups">
            <div class="section-header">
              <label class="field-label" style="margin:0">Gruppi</label>
              <span class="section-sub" id="g-count">
                ${_draft.groups.length > 0 ? _draft.groups.length : 'nessuno'}
              </span>
            </div>
            <p class="field-hint" style="margin-bottom:10px">Crea gruppi per selezionare velocemente i consumer nelle spese.</p>

            <div id="groups-list">
              ${_renderGroups()}
            </div>

            <div class="add-group-row">
              <input id="f-g-name" class="input" type="text"
                     placeholder="Aggiungi gruppo…" />
              <button class="btn-add" id="btn-add-g" aria-label="Aggiungi">+</button>
            </div>
          </div>

          <button class="save-btn" id="btn-save">
            ${isEdit ? 'Salva modifiche' : `Crea ${typeInfo.label}`}
          </button>

          ${isEdit ? `
          <button class="delete-trip-btn" id="btn-delete-trip">
            🗑 Elimina ${typeInfo.label}
          </button>` : ''}

        </main>
      </div>`;
  },

  mount() {
    _isDirty = false;

    // Back con dirty check
    document.querySelector('#screen-trip-form .btn-back')
      ?.addEventListener('click', _handleBack);

    // Dirty tracking campi principali
    ['f-name', 'f-location'].forEach(id =>
      document.getElementById(id)?.addEventListener('input', () => { _isDirty = true; }));
    ['f-start', 'f-end'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => { _isDirty = true; }));

    // Tipo evento
    document.getElementById('type-row')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      _draft.type = btn.dataset.type;
      _isDirty = true;
      // Aggiorna chip attivo
      document.querySelectorAll('[data-type]')
        .forEach(b => b.classList.toggle('filter-chip--active', b.dataset.type === _draft.type));
      // Aggiorna titolo topbar e label nome in tempo reale
      const info = tripTypeInfo(_draft.type);
      const titleEl = document.querySelector('#screen-trip-form .topbar__title');
      if (titleEl) titleEl.textContent = _mode === 'edit' ? `Modifica ${info.label}` : `Nuovo ${info.label}`;
      const nameLabelEl = document.querySelector('#screen-trip-form .field-label');
      if (nameLabelEl) nameLabelEl.textContent = `Nome ${info.label} *`;
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn && _mode !== 'edit') saveBtn.textContent = `Crea ${info.label}`;
      const delBtn = document.getElementById('btn-delete-trip');
      if (delBtn) delBtn.textContent = `🗑 Elimina ${info.label}`;
    });

    // Valuta
    document.getElementById('currency-row')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-currency]');
      if (!btn) return;
      _draft.currency = btn.dataset.currency;
      _isDirty = true;
      document.querySelectorAll('[data-currency]')
        .forEach(b => b.classList.remove('filter-chip--active'));
      btn.classList.add('filter-chip--active');
    });

    // Aggiungi partecipante
    const _addP = () => {
      const input = document.getElementById('f-p-name');
      const name  = input?.value.trim();
      if (!name) { input?.focus(); return; }
      _draft.participants.push({
        id: crypto.randomUUID(), name,
        color: _nextColor(),
        avatarIndex: _draft.participants.length % 47,  // avatar automatico, modificabile
        startDate: null, endDate: null,
      });
      input.value = '';
      input.focus();
      _isDirty = true;
      _refreshParticipants();
    };

    document.getElementById('btn-add-p')?.addEventListener('click', _addP);
    document.getElementById('f-p-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _addP(); }
    });

    _bindParticipantEvents();

    // Aggiungi gruppo
    const _addG = () => {
      const input = document.getElementById('f-g-name');
      const name  = input?.value.trim();
      if (!name) { input?.focus(); return; }
      _draft.groups.push({ id: crypto.randomUUID(), name, members: [] });
      input.value = '';
      input.focus();
      _isDirty = true;
      _refreshGroups();
    };
    document.getElementById('btn-add-g')?.addEventListener('click', _addG);
    document.getElementById('f-g-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _addG(); }
    });

    _bindGroupEvents();

    document.getElementById('btn-save')?.addEventListener('click', _handleSave);

    // Elimina viaggio (solo in edit mode)
    document.getElementById('btn-delete-trip')?.addEventListener('click', () => {
      const tripName = _original?.name ?? 'questo evento';
      const typeLabel = tripTypeInfo(_draft.type).label;
      Modal.confirm({
        title:        `Elimina ${typeLabel}`,
        message:      `Stai per eliminare "${tripName}" con tutte le sue spese e saldi. L'operazione non può essere annullata.`,
        confirmLabel: 'Elimina definitivamente',
        danger:       true,
        onConfirm:    async () => {
          await Actions.deleteTrip(_original.id);
          _reset();
          Router.go('home');
          Toast.show(`"${tripName}" eliminato`, { type: 'info' });
        },
      });
    });
  },

  unmount() {
    _mode        = 'create';
    _original    = null;
    _draft       = _emptyDraft();
    _expandedPid = null;
    _expandedGid = null;
    _isDirty     = false;
    _initialized = false;
    _colorIdx    = 0;
  },
};

// ── Salva ─────────────────────────────────────────────
async function _handleSave() {
  // Leggi i campi al momento del salvataggio (sicuro)
  _draft.name      = document.getElementById('f-name')?.value.trim()     ?? '';
  _draft.location  = document.getElementById('f-location')?.value.trim() ?? '';
  _draft.startDate = document.getElementById('f-start')?.value           ?? '';
  _draft.endDate   = document.getElementById('f-end')?.value             ?? '';

  if (!_draft.name)                      return Toast.show(`Inserisci il nome del ${tripTypeInfo(_draft.type).label.toLowerCase()}`, { type: 'error' });
  if (!_draft.startDate)                 return Toast.show('Seleziona la data di inizio',                 { type: 'error' });
  if (!_draft.endDate)                   return Toast.show('Seleziona la data di fine',                   { type: 'error' });
  if (_draft.endDate < _draft.startDate) return Toast.show('La data di fine deve essere dopo l\'inizio', { type: 'error' });
  if (_draft.participants.length === 0)  return Toast.show('Aggiungi almeno un partecipante',             { type: 'error' });

  if (_mode === 'create') {
    const tripResult = await Actions.createTrip({
      name: _draft.name, location: _draft.location,
      startDate: _draft.startDate, endDate: _draft.endDate, currency: _draft.currency,
      type: _draft.type,
      groups: _draft.groups,
    });
    if (!tripResult.ok) return Toast.show(tripResult.errors[0], { type: 'error' });
    const trip = tripResult.value;
    for (const p of _draft.participants) {
      const pr = await Actions.addParticipant(trip.id, p);
      if (!pr.ok) return Toast.show(pr.errors[0], { type: 'error' });
    }
    _isDirty = false;
    Router.go('trip', { tripId: trip.id });

  } else {
    const tripId  = _original.id;
    const origMap = new Map(_original.participants.map(p => [p.id, p]));
    const draftIds = new Set(_draft.participants.map(p => p.id));

    // Rimossi
    for (const p of _original.participants) {
      if (!draftIds.has(p.id)) await Actions.removeParticipant(tripId, p.id);
    }
    // Nuovi o modificati
    for (const p of _draft.participants) {
      if (!origMap.has(p.id)) {
        await Actions.addParticipant(tripId, p);
      } else if (JSON.stringify(origMap.get(p.id)) !== JSON.stringify(p)) {
        await Actions.updateParticipant(tripId, p.id, p);
      }
    }
    // Metadata trip + gruppi
    await Actions.updateTrip(tripId, {
      name: _draft.name, location: _draft.location,
      startDate: _draft.startDate, endDate: _draft.endDate, currency: _draft.currency,
      type: _draft.type,
      groups: _draft.groups,
    });

    _isDirty = false;
    Router.go('trip', { tripId });
  }
}

// ── Back con dirty check ──────────────────────────────
function _handleBack() {
  if (!_isDirty) {
    _navigateBack();
    return;
  }
  Modal.confirm({
    title:        'Modifiche non salvate',
    message:      'Vuoi uscire senza salvare?',
    confirmLabel: 'Esci',
    onConfirm:    _navigateBack,
  });
}

function _navigateBack() {
  Router.go(_mode === 'edit' && _original ? 'trip' : 'home',
            _original ? { tripId: _original.id } : {});
}

// ── Render partecipanti ───────────────────────────────
function _renderParticipants() {
  if (_draft.participants.length === 0) {
    return `<p class="field-hint">Nessun partecipante ancora</p>`;
  }
  return _draft.participants.map(p => _renderPItem(p)).join('');
}

function _renderPItem(p) {
  const isOpen     = _expandedPid === p.id;
  const trip       = { startDate: _draft.startDate, endDate: _draft.endDate };
  const hasPartial = p.startDate || p.endDate;
  const meta       = _presenzaLabel(p, trip);

  return `
    <div class="p-item ${isOpen ? 'p-item--open' : ''}" data-pid="${p.id}">

      <div class="p-item__head" data-expand="${p.id}">
        ${participantAvatar(p, 'avatar--sm')}
        <div class="p-item__info">
          <span class="p-item__name">${_h(p.name) || '<em>senza nome</em>'}</span>
          <span class="p-item__meta">${meta}</span>
        </div>
        <span class="p-item__chevron">›</span>
      </div>

      ${isOpen ? `
      <div class="p-item__editor">

        <label class="field-label">Nome</label>
        <input class="input p-input" type="text" value="${_h(p.name)}"
               data-pid="${p.id}" data-pfield="name" />

        <details class="presence-section" ${hasPartial ? 'open' : ''}>
          <summary class="presence-summary">
            ${hasPartial ? '📅 Presenza parziale' : '+ Presenza parziale'}
          </summary>
          <div class="presence-fields">
            <label class="field-label">Arrivo (vuoto = dall'inizio)</label>
            <input class="input p-input" type="date"
                   value="${p.startDate ?? ''}"
                   data-pid="${p.id}" data-pfield="startDate" />
            <label class="field-label">Partenza (vuoto = fino alla fine)</label>
            <input class="input p-input" type="date"
                   value="${p.endDate ?? ''}"
                   data-pid="${p.id}" data-pfield="endDate"
                   style="margin-bottom:0" />
          </div>
        </details>

        <label class="field-label">Avatar</label>
        <div class="avatar-picker">
          ${Array.from({length: 47}, (_, i) => `
            <button class="avatar-pick-btn ${p.avatarIndex === i ? 'avatar-pick-btn--active' : ''}"
                    data-pid="${p.id}" data-avatarindex="${i}"
                    title="Avatar ${i}">
              <img src="./assets/avatars/av${String(i).padStart(2,'0')}.png"
                   alt="av${i}" loading="lazy">
            </button>`).join('')}
        </div>

        <button class="btn-remove-p" data-removepid="${p.id}">
          Rimuovi partecipante
        </button>

      </div>` : ''}
    </div>`;
}

function _presenzaLabel(p, trip) {
  if (!p.startDate && !p.endDate) return 'sempre';
  const f   = d => new Date(d + 'T00:00:00')
                     .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const from = p.startDate ?? trip.startDate;
  const to   = p.endDate   ?? trip.endDate;
  return from && to ? `${f(from)} – ${f(to)}` : 'parziale';
}

// ── Event binding partecipanti ────────────────────────
function _refreshParticipants() {
  const list  = document.getElementById('participants-list');
  const count = document.getElementById('p-count');
  if (list)  list.innerHTML = _renderParticipants();
  if (count) count.textContent = _draft.participants.length > 0
    ? _draft.participants.length : 'nessuno';
  _bindParticipantEvents();
}

function _bindParticipantEvents() {
  // Espandi / collassa
  document.querySelectorAll('[data-expand]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const pid    = e.currentTarget.dataset.expand;
      _expandedPid = _expandedPid === pid ? null : pid;
      _refreshParticipants();
      // Focus sul campo nome dopo l'espansione
      if (_expandedPid) {
        setTimeout(() => document.querySelector(`.p-item[data-pid="${pid}"] .p-input`)?.focus(), 50);
      }
    });
  });

  // Campi dell'editor (nome, date)
  document.querySelectorAll('[data-pfield]').forEach(input => {
    input.addEventListener('input',  _updatePField);
    input.addEventListener('change', _updatePField);
  });

  // Avatar picker
  document.querySelectorAll('[data-avatarindex]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = e.currentTarget.dataset.pid;
      const idx = Number(e.currentTarget.dataset.avatarindex);
      const p   = _findP(pid);
      if (!p) return;
      p.avatarIndex = idx;
      _isDirty = true;
      document.querySelectorAll(`.p-item[data-pid="${pid}"] .avatar-pick-btn`)
        .forEach(b => b.classList.toggle('avatar-pick-btn--active', Number(b.dataset.avatarindex) === idx));
      const avatarEl = document.querySelector(`.p-item[data-pid="${pid}"] .p-item__head > .avatar`);
      if (avatarEl) updateAvatarEl(avatarEl, p);
    });
  });

  // Rimuovi
  document.querySelectorAll('[data-removepid]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = e.currentTarget.dataset.removepid;
      if (_draft.participants.length <= 1) {
        Toast.show('Deve esserci almeno un partecipante', { type: 'error' }); return;
      }
      _draft.participants = _draft.participants.filter(p => p.id !== pid);
      if (_expandedPid === pid) _expandedPid = null;
      _isDirty = true;
      _refreshParticipants();
    });
  });
}

function _updatePField(e) {
  const pid   = e.target.dataset.pid;
  const field = e.target.dataset.pfield;
  const p     = _findP(pid);
  if (!p) return;
  p[field]  = e.target.value || null;
  _isDirty  = true;
  if (field === 'name') {
    const nameEl   = document.querySelector(`.p-item[data-pid="${pid}"] .p-item__name`);
    const avatarEl = document.querySelector(`.p-item[data-pid="${pid}"] .p-item__head > .avatar`);
    if (nameEl)   nameEl.textContent = p.name || '—';
    if (avatarEl) updateAvatarEl(avatarEl, p);
  } else {
    _updatePMeta(pid);
  }
}

function _updatePMeta(pid) {
  const p    = _findP(pid);
  if (!p) return;
  const trip = { startDate: _draft.startDate, endDate: _draft.endDate };
  const meta = document.querySelector(`.p-item[data-pid="${pid}"] .p-item__meta`);
  if (meta) meta.textContent = _presenzaLabel(p, trip);
}

// ── Render gruppi ─────────────────────────────────────
function _renderGroups() {
  if (_draft.groups.length === 0) {
    return `<p class="field-hint">Nessun gruppo ancora</p>`;
  }
  return _draft.groups.map(g => _renderGroupItem(g)).join('');
}

function _renderGroupItem(g) {
  const isOpen  = _expandedGid === g.id;
  const members = (g.members ?? [])
    .map(pid => _draft.participants.find(p => p.id === pid))
    .filter(Boolean);

  return `
    <div class="group-item ${isOpen ? 'group-item--open' : ''}" data-gid="${g.id}">

      <div class="group-item__head" data-gexpand="${g.id}">
        <span class="group-item__icon">👥</span>
        <div class="group-item__info">
          <span class="group-item__name">${_h(g.name) || '<em>senza nome</em>'}</span>
          <div class="group-item__members">
            ${members.length > 0
              ? members.map(p => `<span class="group-member-pip" style="background:${p.color}" title="${_h(p.name)}">${p.name.charAt(0).toUpperCase()}</span>`).join('')
              : `<span class="field-hint" style="margin:0;font-size:11px">nessun membro</span>`}
          </div>
        </div>
        <span class="p-item__chevron">›</span>
      </div>

      ${isOpen ? `
      <div class="group-item__editor">

        <label class="field-label">Nome gruppo</label>
        <input class="input g-input" type="text" value="${_h(g.name)}"
               data-gid="${g.id}" data-gfield="name" />

        <label class="field-label">Membri</label>
        <div class="group-member-list">
          ${_draft.participants.map(p => {
            const isMember = (g.members ?? []).includes(p.id);
            return `
              <button class="group-member-toggle ${isMember ? 'group-member-toggle--on' : ''}"
                      data-gmtoggle="${p.id}" data-gmgid="${g.id}">
                ${participantAvatar(p, 'avatar--sm')}
                <span class="group-member-toggle__name">${_h(p.name)}</span>
                ${isMember ? '<span class="split-check">✓</span>' : ''}
              </button>`;
          }).join('')}
        </div>

        <button class="btn-remove-p" data-removegid="${g.id}">
          Rimuovi gruppo
        </button>

      </div>` : ''}
    </div>`;
}

// ── Event binding gruppi ──────────────────────────────
function _refreshGroups() {
  const list  = document.getElementById('groups-list');
  const count = document.getElementById('g-count');
  if (list)  list.innerHTML = _renderGroups();
  if (count) count.textContent = _draft.groups.length > 0 ? _draft.groups.length : 'nessuno';
  _bindGroupEvents();
}

function _bindGroupEvents() {
  // Espandi / collassa
  document.querySelectorAll('[data-gexpand]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const gid    = e.currentTarget.dataset.gexpand;
      _expandedGid = _expandedGid === gid ? null : gid;
      _refreshGroups();
      if (_expandedGid) {
        setTimeout(() => document.querySelector(`.group-item[data-gid="${gid}"] .g-input`)?.focus(), 50);
      }
    });
  });

  // Campo nome gruppo
  document.querySelectorAll('[data-gfield]').forEach(input => {
    input.addEventListener('input', e => {
      const gid   = e.target.dataset.gid;
      const field = e.target.dataset.gfield;
      const g     = _findG(gid);
      if (!g) return;
      g[field]  = e.target.value;
      _isDirty  = true;
      const nameEl = document.querySelector(`.group-item[data-gid="${gid}"] .group-item__name`);
      if (nameEl) nameEl.textContent = g.name || '—';
    });
  });

  // Toggle membro nel gruppo
  document.querySelectorAll('[data-gmtoggle]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pid = e.currentTarget.dataset.gmtoggle;
      const gid = e.currentTarget.dataset.gmgid;
      const g   = _findG(gid);
      if (!g) return;
      const idx = g.members.indexOf(pid);
      if (idx === -1) g.members.push(pid);
      else            g.members.splice(idx, 1);
      _isDirty = true;
      _refreshGroups();
    });
  });

  // Rimuovi gruppo
  document.querySelectorAll('[data-removegid]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const gid = e.currentTarget.dataset.removegid;
      _draft.groups = _draft.groups.filter(g => g.id !== gid);
      if (_expandedGid === gid) _expandedGid = null;
      _isDirty = true;
      _refreshGroups();
    });
  });
}

// ── Helpers ───────────────────────────────────────────
let _colorIdx = 0;
function _nextColor() { return COLORS[_colorIdx++ % COLORS.length]; }
function _findP(pid)  { return _draft.participants.find(p => p.id === pid) ?? null; }
function _findG(gid)  { return _draft.groups.find(g => g.id === gid) ?? null; }
function _h(str)      { return (str ?? '').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
