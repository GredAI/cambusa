import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav } from '../ui.js';
import { Toast }     from '../toast.js';
import { isGroupExpense, readAmount, readPayers } from '../domain/guards.js';
import { participantAvatar } from '../components/avatar.js';
import { tripTypeInfo } from '../domain/tripType.js';

const CAT_ICON = {
  alloggio: '🏠', trasporti: '🚗', noleggi: '⛵',
  cibo: '🍝', spesa: '🛒', attivita: '🎭', servizi: '🔧', altro: '📋',
};

export const TripScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return `
      <div class="screen" id="screen-trip-notfound">
        <div style="display:flex;flex-direction:column;align-items:center;
                    justify-content:center;height:100vh;gap:16px;padding:32px;text-align:center">
          <p style="color:var(--color-text-sub);font-size:15px">Nessun viaggio selezionato.</p>
          <button class="btn-primary" id="btn-notfound-home">← Torna alla Home</button>
        </div>
      </div>`;

    const isArchived  = !!trip.archivedAt;
    const typeInfo    = tripTypeInfo(trip.type ?? 'viaggio');
    const total       = Selectors.tripTotal();
    const balances    = Selectors.balances();
    const groupExps   = Selectors.expensesSortedByDate().filter(isGroupExpense);
    const recent      = groupExps.slice(0, 3);
    const catTotals   = Selectors.categoryTotals();
    const f = d => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    // Barre categorie
    const catEntries = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const maxCat = catEntries[0]?.[1] ?? 1;

    const rightBtn = isArchived
      ? `<button class="btn-link text-positive" data-action="unarchive-trip">↺ Riattiva</button>`
      : `<button class="btn-link" data-action="edit-trip">Modifica</button>`;

    return `
      <div class="screen" id="screen-trip">
        ${Topbar({
          title:    trip.name,
          subtitle: `${trip.location} · ${f(trip.startDate)} – ${f(trip.endDate)}`,
          back:     true,
          backNav:  'home',
          right:    rightBtn,
        })}

        <main class="screen-content">

          ${isArchived ? `
            <div class="archive-banner">
              🗄 ${typeInfo.label} archiviato
            </div>` : ''}

          <div class="card total-card">
            <p class="total-card__label">Totale ${typeInfo.label}</p>
            <h2 class="total-card__amount">${Selectors.formatCurrency(total)}</h2>
            <p class="total-card__meta">${groupExps.length} ${groupExps.length === 1 ? 'spesa' : 'spese'} · ${trip.participants.length} partecipanti</p>
          </div>

          <div class="card">
            <div class="section-header">
              <h3 class="section-title">Saldi</h3>
              <button class="btn-link" data-go="balances">Dettaglio →</button>
            </div>
            ${balances.map(b => `
              <div class="balance-row">
                ${participantAvatar(b.participant)}
                <span class="balance-row__name">${b.participant.name}</span>
                <span class="balance-row__amount ${b.balance >= 0 ? 'text-positive' : 'text-negative'}">
                  ${b.balance >= 0 ? '+' : ''}${Selectors.formatCurrency(b.balance)}
                </span>
              </div>`).join('')}
          </div>

          ${catEntries.length ? `
          <div class="card">
            <div class="section-header">
              <h3 class="section-title">Per categoria</h3>
            </div>
            ${catEntries.map(([cat, amt]) => {
              const pct = Math.round(amt / maxCat * 100);
              return `
                <div class="cat-bar-row">
                  <span class="cat-bar-icon">${CAT_ICON[cat] ?? '📋'}</span>
                  <div class="cat-bar-body">
                    <div class="cat-bar-label">
                      <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                      <span class="cat-bar-amt">${Selectors.formatCurrency(amt)}</span>
                    </div>
                    <div class="cat-bar-track">
                      <div class="cat-bar-fill cat-${cat}" style="width:${pct}%"></div>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>` : ''}

          <div class="card">
            <div class="section-header">
              <h3 class="section-title">Ultime spese</h3>
              <button class="btn-link" data-go="expenses">Vedi tutte</button>
            </div>
            ${recent.length ? recent.map(e => {
              const payers     = readPayers(e);
              const payerNames = payers
                .map(p => trip.participants.find(x => x.id === p.participantId)?.name ?? '—')
                .join(', ');
              return `
                <div class="expense-item expense-item--tap"
                     data-edit-expense="${e.id}">
                  <div class="expense-item__icon cat-${e.category}">${CAT_ICON[e.category] || '📋'}</div>
                  <div class="expense-item__body">
                    <strong>${e.title}</strong>
                    <p>Pagato da ${payerNames || '—'}</p>
                  </div>
                  <span class="expense-item__amount">${Selectors.formatCurrency(readAmount(e))}</span>
                </div>`;
            }).join('') : `<p class="empty-state__text">Nessuna spesa ancora.</p>`}
          </div>

          ${!isArchived ? `
          <button class="archive-btn" data-action="archive-trip">
            🗄 Archivia ${typeInfo.label}
          </button>` : ''}

        </main>
        ${BottomNav('home')}
      </div>`;
  },

  mount() {
    // Se viaggio non trovato (es. eliminato), auto-redirect alla home
    if (!State.currentTrip) {
      document.getElementById('btn-notfound-home')
        ?.addEventListener('click', () => Router.go('home'));
      setTimeout(() => Router.go('home'), 50);
      return;
    }

    document.getElementById('screen-trip')?.addEventListener('click', async e => {
      const back = e.target.closest('.btn-back');
      if (back) { Router.go('home'); return; }

      const edit = e.target.closest('[data-action="edit-trip"]');
      if (edit) { Router.go('trip-form', { mode: 'edit', tripId: State.currentTrip?.id }); return; }

      const archive = e.target.closest('[data-action="archive-trip"]');
      if (archive) {
        const archivedType = tripTypeInfo(State.currentTrip?.type ?? 'viaggio').label;
        await Actions.archiveTrip(State.currentTrip.id);
        Toast.show(`${archivedType} archiviato`, { type: 'success' });
        Router.go('trip', { tripId: State.currentTrip.id });
        return;
      }

      const unarchive = e.target.closest('[data-action="unarchive-trip"]');
      if (unarchive) {
        const unarchivedType = tripTypeInfo(State.currentTrip?.type ?? 'viaggio').label;
        await Actions.unarchiveTrip(State.currentTrip.id);
        Toast.show(`${unarchivedType} riattivato`);
        Router.go('trip', { tripId: State.currentTrip.id });
        return;
      }

      // Tap su spesa recente → apri in modifica
      const editExp = e.target.closest('[data-edit-expense]');
      if (editExp) {
        Router.go('new-expense', { tripId: State.currentTrip.id, expenseId: editExp.dataset.editExpense });
        return;
      }

      const go = e.target.closest('[data-go]');
      if (go) {
        Router.go(go.dataset.go, { tripId: State.currentTrip.id });
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
