/* =====================================================
   CAMBUSA — expenses.js  (Ledger V3)
   Lista spese con:
   – Raggruppamento per data (Oggi / Ieri / data)
   – Header data sticky
   – Filtri categoria (partial render)
   – Totali per categoria (solo in vista "Tutte")
   – Delete spesa inline
   ===================================================== */

import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav } from '../ui.js';
import { ExpenseCard, CAT_CONFIG } from '../components/expenseCard.js';
import { DateGroup }   from '../components/dateGroup.js';
import { FilterChips } from '../components/filterChips.js';
import { Modal }       from '../ui/modal.js';
import { Toast }       from '../toast.js';

// ── Stato modulo ──────────────────────────────────────
let _activeFilter   = 'all';
let _activeGroupId  = null;   // id gruppo attivo per filtro, null = tutti
let _searchQuery    = '';
let _searchVisible  = false;
const _openBreakdowns = new Set();

// ── Screen ────────────────────────────────────────────
export const ExpensesScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Viaggio non trovato.</p>';

    const categories = Selectors.expenseCategories();
    const groupCount = Selectors.activeGroupExpenseCount();

    return `
      <div class="screen" id="screen-expenses">
        ${Topbar({
          title:    'Spese',
          subtitle: trip.name,
          back:     true,
          backNav:  'trip',
          right:    `<div class="expenses-topbar-right">
                      <button class="expenses-search-btn${_searchVisible ? ' expenses-search-btn--active' : ''}"
                              data-action="toggle-search" title="Cerca">🔍</button>
                      <button class="expenses-scan-btn" data-action="open-scanner" title="Scansiona scontrino">📷</button>
                      <span class="topbar__badge">${groupCount}</span>
                    </div>`,
        })}

        <main class="screen-content">
          ${FilterChips(categories, _activeFilter)}
          ${_renderGroupFilterRow()}
          <div id="search-bar-container">${_renderSearchBar()}</div>
          <div id="expenses-list">
            ${_renderList()}
          </div>
        </main>

        ${BottomNav('expenses')}
      </div>`;
  },

  mount() {
    // ── Input ricerca (delegato al document per sopravvivere ai re-render) ──
    document.getElementById('screen-expenses')
      ?.addEventListener('input', e => {
        if (e.target.id !== 'search-input') return;
        _searchQuery = e.target.value;
        document.getElementById('expenses-list').innerHTML = _renderList();
      });

    document.getElementById('screen-expenses')
      ?.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _searchVisible) {
          _searchVisible = false;
          _searchQuery   = '';
          document.getElementById('search-bar-container').innerHTML = _renderSearchBar();
          document.getElementById('expenses-list').innerHTML = _renderList();
          document.querySelector('.expenses-search-btn')?.classList.remove('expenses-search-btn--active');
        }
      });

    document.getElementById('screen-expenses')
      ?.addEventListener('click', async e => {

        // ── Back ─────────────────────────────────────
        if (e.target.closest('.btn-back')) {
          Router.go('trip', { tripId: State.currentTrip?.id });
          return;
        }

        // ── Toggle ricerca ───────────────────────────
        if (e.target.closest('[data-action="toggle-search"]')) {
          _searchVisible = !_searchVisible;
          if (!_searchVisible) _searchQuery = '';
          document.getElementById('search-bar-container').innerHTML = _renderSearchBar();
          document.getElementById('expenses-list').innerHTML = _renderList();
          e.target.closest('[data-action="toggle-search"]')
            ?.classList.toggle('expenses-search-btn--active', _searchVisible);
          if (_searchVisible) setTimeout(() => document.getElementById('search-input')?.focus(), 50);
          return;
        }

        // ── Scanner scontrino ────────────────────────
        if (e.target.closest('[data-action="open-scanner"]')) {
          Router.go('receipt-scanner', { tripId: State.currentTrip?.id });
          return;
        }

        // ── Toggle breakdown ─────────────────────────
        const chevron = e.target.closest('[data-toggle-breakdown]');
        if (chevron) {
          e.stopPropagation();
          const id = chevron.dataset.toggleBreakdown;
          if (_openBreakdowns.has(id)) {
            _openBreakdowns.delete(id);
          } else {
            _openBreakdowns.add(id);
          }
          document.getElementById('expenses-list').innerHTML = _renderList();
          return;
        }

        // ── Tap su card → edit spesa ──────────────────
        const card = e.target.closest('.expense-card');
        if (card && !e.target.closest('[data-delete-expense]') && !e.target.closest('.expense-breakdown')) {
          Router.go('new-expense', {
            tripId:    State.currentTrip.id,
            expenseId: card.dataset.expenseId,
          });
          return;
        }

        // ── Filtro categoria ─────────────────────────
        const chip = e.target.closest('[data-filter]');
        if (chip) {
          _activeFilter = chip.dataset.filter;
          document.querySelectorAll('[data-filter]').forEach(c =>
            c.classList.toggle('filter-chip--active', c.dataset.filter === _activeFilter)
          );
          document.getElementById('expenses-list').innerHTML = _renderList();
          return;
        }

        // ── Filtro gruppo ─────────────────────────────
        const gChip = e.target.closest('[data-group-filter]');
        if (gChip) {
          _activeGroupId = gChip.dataset.groupFilter || null;
          document.querySelectorAll('[data-group-filter]').forEach(c =>
            c.classList.toggle('filter-chip--active',
              (_activeGroupId === null && c.dataset.groupFilter === '') ||
              c.dataset.groupFilter === _activeGroupId
            )
          );
          document.getElementById('expenses-list').innerHTML = _renderList();
          return;
        }

        // ── Elimina spesa ────────────────────────────
        const del = e.target.closest('[data-delete-expense]');
        if (del) {
          const id      = del.dataset.deleteExpense;
          const expense = State.expenses.find(e => e.id === id);
          Modal.confirm({
            title:        'Elimina spesa',
            message:      expense?.title ?? '',
            confirmLabel: 'Elimina',
            danger:       true,
            onConfirm: async () => {
              const result = await Actions.deleteExpense(id);
              if (!result.ok) {
                Toast.show('Impossibile eliminare questa spesa', { type: 'error' });
                return;
              }
              const badge = document.querySelector('.topbar__badge');
              if (badge) badge.textContent = Selectors.activeGroupExpenseCount();
              document.getElementById('expenses-list').innerHTML = _renderList();
              Toast.show(`"${expense?.title ?? 'Spesa'}" eliminata`, {
                type: 'info',
                undo: async () => {
                  await Actions.restoreExpense(id);
                  if (badge) badge.textContent = Selectors.activeGroupExpenseCount();
                  document.getElementById('expenses-list').innerHTML = _renderList();
                },
              });
            },
          });
          return;
        }

        // ── Bottom nav ───────────────────────────────
        const nav = e.target.closest('[data-nav]');
        if (!nav) return;
        const t = nav.dataset.nav;
        if (t === 'home') { Router.go('home'); return; }
        Router.go(t, { tripId: State.currentTrip?.id });
      });
  },

  unmount() {
    _activeFilter  = 'all';
    _searchQuery   = '';
    _searchVisible = false;
    _openBreakdowns.clear();
  },
};

// ── Render barra di ricerca ───────────────────────────
function _renderSearchBar() {
  if (!_searchVisible) return '';
  return `
    <div class="search-bar">
      <input id="search-input" class="input search-input" type="search"
             placeholder="Cerca per titolo, pagante, note…"
             value="${(_searchQuery ?? '').replace(/"/g, '&quot;')}" />
    </div>`;
}

// ── Chip filtro gruppo ────────────────────────────────
function _renderGroupFilterRow() {
  const trip   = State.currentTrip;
  const groups = (trip?.groups ?? []).filter(g => (g.members ?? []).length > 0);
  if (!groups.length) return '';

  const allActive = _activeGroupId === null;
  return `
    <div class="filter-row group-filter-row" id="group-filter-row">
      <button class="filter-chip ${allActive ? 'filter-chip--active' : ''}"
              data-group-filter="">Tutti</button>
      ${groups.map(g => `
        <button class="filter-chip filter-chip--group ${_activeGroupId === g.id ? 'filter-chip--active' : ''}"
                data-group-filter="${g.id}">
          👥 ${g.name}
        </button>`).join('')}
    </div>`;
}

// ── Gruppo che corrisponde esattamente ai consumer ────
function _matchingGroup(expense) {
  const trip   = State.currentTrip;
  const groups = trip?.groups ?? [];
  if (!groups.length) return null;

  const consumerIds = new Set(
    (expense.consumers ?? []).map(c => c.participantId)
  );
  if (!consumerIds.size) return null;

  for (const g of groups) {
    const members = g.members ?? [];
    if (!members.length) continue;
    // Corrispondenza esatta: stessi partecipanti, stesso numero
    if (members.length === consumerIds.size &&
        members.every(pid => consumerIds.has(pid))) {
      return g;
    }
  }
  return null;
}

// ── Filtra per gruppo (tutti i membri del gruppo sono consumer) ──
function _filterByGroup(dateGroups, groupId) {
  const trip  = State.currentTrip;
  const group = (trip?.groups ?? []).find(g => g.id === groupId);
  if (!group) return dateGroups;
  const members = group.members ?? [];
  if (!members.length) return dateGroups;

  return dateGroups
    .map(dg => ({
      ...dg,
      expenses: dg.expenses.filter(e => {
        const cids = (e.consumers ?? []).map(c => c.participantId);
        return members.every(pid => cids.includes(pid));
      }),
    }))
    .filter(dg => dg.expenses.length > 0);
}

// ── Render lista (partial) ────────────────────────────
function _renderList() {
  const trip = State.currentTrip;
  if (!trip) return '';

  const category  = _activeFilter !== 'all' ? _activeFilter : null;
  let   groups    = Selectors.groupedExpenses(category);
  const searching = _searchVisible && _searchQuery.trim().length > 0;

  if (searching)       groups = _filterBySearch(groups, _searchQuery.trim());
  if (_activeGroupId)  groups = _filterByGroup(groups, _activeGroupId);

  const activeGroup = _activeGroupId
    ? (trip.groups ?? []).find(g => g.id === _activeGroupId)
    : null;

  if (!groups.length) {
    const msg = searching
      ? `Nessun risultato per "<strong>${_esc(_searchQuery)}</strong>"`
      : activeGroup
        ? `Nessuna spesa per il gruppo <strong>${_esc(activeGroup.name)}</strong>.`
        : category ? 'Nessuna spesa in questa categoria.' : 'Nessuna spesa ancora.';
    return `
      <div class="empty-state" style="padding:3rem 1rem">
        <p class="empty-state__icon">🧾</p>
        <p class="empty-state__text">${msg}</p>
      </div>`;
  }

  const groupsHtml = groups.map(g => DateGroup(g, trip, e => ({
    deletable:  true,
    breakdown:  _openBreakdowns.has(e.id),
    groupName:  _matchingGroup(e)?.name,   // badge gruppo se consumer = gruppo esatto
  }))).join('');
  // Nascondi i totali categoria durante la ricerca o filtro gruppo
  const totalsHtml = (category || searching || _activeGroupId) ? '' : _renderCategoryTotals();

  return groupsHtml + totalsHtml;
}

// ── Filtra gruppi per query testuale ──────────────────
function _filterBySearch(groups, query) {
  const q    = query.toLowerCase();
  const pMap = new Map(
    (State.currentTrip?.participants ?? []).map(p => [p.id, p.name.toLowerCase()])
  );
  return groups
    .map(g => ({
      ...g,
      expenses: g.expenses.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.notes  ?? '').toLowerCase().includes(q) ||
        (e.category ?? '').toLowerCase().includes(q) ||
        (e.payers ?? []).some(p => (pMap.get(p.participantId) ?? '').includes(q))
      ),
    }))
    .filter(g => g.expenses.length > 0);
}

function _esc(str) {
  return (str ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Totali per categoria ──────────────────────────────
function _renderCategoryTotals() {
  const totals  = Selectors.categoryTotals();
  const entries = Object.entries(totals).sort(([, a], [, b]) => b - a);
  if (!entries.length) return '';

  const rows = entries.map(([cat, amount]) => {
    const cfg = CAT_CONFIG[cat] ?? { icon: '📦', label: cat };
    return `
      <div class="cat-total-row">
        <span class="cat-total-row__icon">${cfg.icon}</span>
        <span class="cat-total-row__label">${cfg.label}</span>
        <span class="cat-total-row__amount">${Selectors.formatCurrency(amount)}</span>
      </div>`;
  }).join('');

  return `
    <div class="card cat-totals">
      <h3 class="section-title" style="margin-bottom:12px">Per categoria</h3>
      ${rows}
    </div>`;
}
