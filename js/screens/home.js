import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav, CambusaLogo } from '../ui.js';
import { Toast }     from '../toast.js';

// ── Micro-arc logomark (card widget) ─────────────────────
function _microArc(nPart) {
  return `
    <svg class="trip-card__arc" viewBox="0 0 100 100" width="48" height="48"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M 61.129 91.535 A 43 43 0 1 1 61.129 8.465 L 55.823 28.267 A 22.5 22.5 0 1 0 55.823 71.733 Z"
            fill="#1D3844"/>
      <path d="M 85.224 74.664 A 43 43 0 0 1 61.129 91.535 L 55.823 71.733 A 22.5 22.5 0 0 0 68.431 62.905 Z"
            fill="#2FA7A0"/>
      <path d="M 61.129 8.465 A 43 43 0 0 1 85.224 25.336 L 68.431 37.095 A 22.5 22.5 0 0 0 55.823 28.267 Z"
            fill="#F47461"/>
      <circle cx="73" cy="17" r="5" fill="#F47461"/>
      <text x="37" y="57" text-anchor="middle" font-family="Sora,sans-serif"
            font-size="22" font-weight="700" fill="#1D3844">${nPart}</text>
    </svg>`;
}

// ── Avatar pill (overlapping initials) ───────────────────
function _avatarPill(participants) {
  const shown = participants.slice(0, 5);
  const extra = participants.length - shown.length;
  const colors = ['#2FA7A0','#F47461','#1D3844','#d4a96a','#8b5cf6'];
  const circles = shown.map((p, i) => `
    <div class="trip-avatar" style="background:${colors[i % colors.length]};
         margin-left:${i === 0 ? '0' : '-7px'};z-index:${10 - i}">
      ${p.name.charAt(0).toUpperCase()}
    </div>`).join('');
  const extraBadge = extra > 0
    ? `<div class="trip-avatar trip-avatar--extra" style="margin-left:-7px">+${extra}</div>`
    : '';
  return `<div class="trip-card__avatars">${circles}${extraBadge}</div>`;
}

export const HomeScreen = {

  html() {
    const trips    = State.trips;
    const active   = trips.filter(t => !t.archivedAt);
    const archived = trips.filter(t =>  t.archivedAt);
    const f = d => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    // Hero stats
    const nActive   = active.length;
    const nArchived = archived.length;
    const totalSpese = trips.reduce((s, t) => s + Selectors.tripExpenseCountById(t.id), 0);
    // All unique participants across active trips (by id)
    const partMap = new Map();
    active.forEach(t => t.participants.forEach(p => partMap.set(p.id, p)));
    const heroParticipants = [...partMap.values()];

    // ── Trip card (enhanced) ───────────────────────────────
    const tripCard = t => {
      const total  = Selectors.tripTotalById(t.id);
      const nSpese = Selectors.tripExpenseCountById(t.id);
      const nPart  = t.participants.length;
      const stateClass = t.archivedAt ? 'trip-card--archived' : 'trip-card--active';
      return `
        <div class="card trip-card ${stateClass}" data-action="open-trip" data-trip-id="${t.id}">
          <div class="trip-card__header">
            ${_microArc(nPart)}
            <div class="trip-card__info">
              <h2 class="trip-card__name">${t.name}</h2>
              <p class="trip-card__sub">${t.location}</p>
              <p class="trip-card__dates">${f(t.startDate)} – ${f(t.endDate)}</p>
            </div>
            <span class="badge ${t.archivedAt ? 'badge--gray' : 'badge--teal'}">
              ${Selectors.formatCurrency(total, t.currency)}
            </span>
          </div>
          <div class="trip-card__footer">
            ${_avatarPill(t.participants)}
            <span class="trip-card__meta">${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}</span>
          </div>
        </div>`;
    };

    // ── Hero participant orbit ─────────────────────────────
    const heroColors = ['#2FA7A0','#F47461','#d4a96a','#8b5cf6','#1D3844'];
    const heroAvatarsHtml = heroParticipants.slice(0, 6).map((p, i) => `
      <div class="hero-avatar" style="background:${heroColors[i % heroColors.length]}">
        ${p.name.charAt(0).toUpperCase()}
      </div>`).join('');
    const heroExtraCount = heroParticipants.length > 6 ? heroParticipants.length - 6 : 0;

    // ── Sections ──────────────────────────────────────────
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

        <!-- Hero section -->
        <header class="home-hero">
          <div class="home-hero__top">
            ${CambusaLogo({ size: '40px' })}
            <div class="home-hero__title-wrap">
              <h1 class="home-hero__title">Cambusa</h1>
              <p class="home-hero__sub">Le tue avventure</p>
            </div>
            <button class="home-hero__add" data-action="new-trip" aria-label="Nuovo viaggio">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="5"  y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          ${trips.length ? `
          <div class="home-hero__stats">
            <div class="home-hero__stat">
              <span class="home-hero__stat-value">${nActive}</span>
              <span class="home-hero__stat-label">${nActive === 1 ? 'viaggio attivo' : 'viaggi attivi'}</span>
            </div>
            <div class="home-hero__stat-sep"></div>
            <div class="home-hero__stat">
              <span class="home-hero__stat-value">${totalSpese}</span>
              <span class="home-hero__stat-label">${totalSpese === 1 ? 'spesa' : 'spese'} totali</span>
            </div>
            ${nArchived ? `
            <div class="home-hero__stat-sep"></div>
            <div class="home-hero__stat">
              <span class="home-hero__stat-value">${nArchived}</span>
              <span class="home-hero__stat-label">archiviati</span>
            </div>` : ''}
          </div>
          ${heroParticipants.length ? `
          <div class="home-hero__participants">
            <div class="home-hero__avatars">
              ${heroAvatarsHtml}
              ${heroExtraCount ? `<div class="hero-avatar hero-avatar--extra">+${heroExtraCount}</div>` : ''}
            </div>
            <span class="home-hero__part-label">${heroParticipants.length} partecipanti</span>
          </div>` : ''}
          ` : ''}
        </header>

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
