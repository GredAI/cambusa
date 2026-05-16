import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav } from '../ui.js';
import { Toast }     from '../toast.js';

export const HomeScreen = {

  html() {
    const trips    = State.trips;
    const active   = trips.filter(t => !t.archivedAt);
    const archived = trips.filter(t =>  t.archivedAt);
    const f = d => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    const tripCard = t => {
      const total  = Selectors.tripTotalById(t.id);
      const nSpese = Selectors.tripExpenseCountById(t.id);
      const nPart  = t.participants.length;
      return `
        <div class="card trip-card ${t.archivedAt ? 'trip-card--archived' : ''}"
             data-action="open-trip" data-trip-id="${t.id}">
          <div class="trip-card__row">
            <div>
              <h2 class="trip-card__name">${t.name}</h2>
              <p class="trip-card__sub">${t.location} · ${f(t.startDate)} – ${f(t.endDate)}</p>
              <p class="trip-card__meta">${nPart} partecipanti · ${nSpese} spese</p>
            </div>
            <span class="badge ${t.archivedAt ? 'badge--gray' : 'badge--green'}">
              ${Selectors.formatCurrency(total, t.currency)}
            </span>
          </div>
        </div>`;
    };

    const activeSection = active.length
      ? active.map(tripCard).join('')
      : `<div class="empty-state">
           <p class="empty-state__icon">🧳</p>
           <p class="empty-state__text">Nessun viaggio ancora</p>
           <p class="empty-state__sub">Inizia creando il tuo primo viaggio</p>
           <button class="empty-state__cta" data-action="new-trip">Crea viaggio</button>
         </div>`;

    const archivedSection = archived.length ? `
      <details class="archive-section" id="archive-section">
        <summary class="archive-section__summary">
          🗄 Archivio
          <span class="archive-section__count">${archived.length}</span>
        </summary>
        <div class="archive-section__body">
          ${archived.map(tripCard).join('')}
        </div>
      </details>` : '';

    return `
      <div class="screen" id="screen-home">
        ${Topbar({
          title:    'Cambusa',
          subtitle: 'Le tue avventure',
          right:    `<button class="fab-mini" data-action="new-trip">+</button>`,
        })}
        <main class="screen-content">
          ${activeSection}
          ${archivedSection}
          <div class="import-row">
            <label class="import-btn" title="Importa viaggio da file JSON">
              ⬆ Importa viaggio
              <input type="file" id="input-import-json" accept=".json"
                     style="display:none" />
            </label>
          </div>
        </main>
        ${BottomNav('home')}
      </div>`;
  },

  mount() {
    // Import JSON
    document.getElementById('input-import-json')
      ?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text   = await file.text();
          const bundle = JSON.parse(text);
          const result = await Actions.importTrip(bundle);
          if (!result.ok) {
            Toast.show('File non valido', { type: 'error' });
            return;
          }
          Toast.show(`✓ "${result.value.trip.name}" importato`, { type: 'success' });
          Router.go('home');
        } catch {
          Toast.show('Errore lettura file', { type: 'error' });
        }
        e.target.value = '';  // reset input
      });

    document.getElementById('screen-home')?.addEventListener('click', e => {
      // Apri viaggio
      const card = e.target.closest('[data-action="open-trip"]');
      if (card) {
        Router.go('trip', { tripId: card.dataset.tripId });
        return;
      }

      // Nuovo viaggio
      if (e.target.closest('[data-action="new-trip"]')) {
        Router.go('trip-form', { mode: 'create' });
        return;
      }

      // Bottom nav
      const btn = e.target.closest('[data-nav]');

      if (!btn) return;
      const target = btn.dataset.nav;

      if (target === 'new-expense' || target === 'expenses' || target === 'balances') {
        const trip = State.currentTrip ?? State.trips[0] ?? null;
        if (!trip) { Toast.show('Crea prima un viaggio', { type: 'info' }); return; }
        State.currentTrip = trip;
        Router.go(target, { tripId: trip.id });
        return;
      }

      Router.go(target);
    });
  },

  unmount() {},
};
