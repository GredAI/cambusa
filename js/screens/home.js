import { State }     from '../state.js';
import { Actions }   from '../actions.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar, BottomNav, CambusaLogo } from '../ui.js';
import { Toast }     from '../toast.js';
import { Modal }     from '../ui/modal.js';
import { tripTypeInfo } from '../domain/tripType.js';

// ── Stato trip (calcolato da date, senza caricare spese) ─────
function _tripStatus(t, nSpese) {
  if (t.archivedAt) return { label: 'Archiviato', mod: 'muted' };
  const today = new Date().toISOString().slice(0, 10);
  if (nSpese === 0)        return { label: 'Nuovo',    mod: 'amber' };
  if (t.endDate < today)   return { label: 'Concluso', mod: 'muted' };
  if (t.startDate > today) return { label: 'Prossimo', mod: 'amber' };
  return                          { label: 'In corso', mod: 'teal'  };
}

// ── Palette compass (brand, non colori utente) ────────────
const COMPASS_COLORS = ['#2fa7a0','#f47461','#d4a96a','#8b5cf6','#3b82f6','#10b981','#06b6d4','#ec4899'];

// ── Compass Split — donut per trip card ───────────────────
function _compassSplit(trip, total) {
  const n    = trip.participants.length || 1;
  const CX   = 40, CY = 40, R = 27, SW = 9;
  const circ = 2 * Math.PI * R;
  const gap  = Math.min(3, circ / n / 4);
  const seg  = (circ - n * gap) / n;
  const cur  = trip.currency ?? '€';
  const fmt  = total >= 1000000
    ? `${(total / 100000).toFixed(0)}k`
    : total >= 100000
    ? `${(total / 100000).toFixed(1)}k`
    : (total / 100).toFixed(0);

  // Nessuna spesa ancora: segmenti neutri + trattino centrale
  if (total === 0) {
    const muteArcs = trip.participants.map((_, i) => {
      const off = circ / 4 - i * (seg + gap);
      return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
        stroke="var(--color-border)" stroke-width="${SW}"
        stroke-dasharray="${seg.toFixed(2)} ${(circ - seg).toFixed(2)}"
        stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    }).join('');
    return `
      <svg class="compass-split" viewBox="0 0 80 80" width="64" height="64" style="flex-shrink:0">
        ${muteArcs}
        <text x="${CX}" y="${CY + 5}" text-anchor="middle"
              font-size="14" fill="var(--color-text-muted)" font-family="Sora,sans-serif">—</text>
      </svg>`;
  }

  const arcs = trip.participants.map((_, i) => {
    const off = circ / 4 - i * (seg + gap);
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
      stroke="${COMPASS_COLORS[i % COMPASS_COLORS.length]}"
      stroke-width="${SW}"
      stroke-dasharray="${seg.toFixed(2)} ${(circ - seg).toFixed(2)}"
      stroke-dashoffset="${(-off).toFixed(2)}"/>`;
  }).join('');

  return `
    <svg class="compass-split" viewBox="0 0 80 80" width="64" height="64" style="flex-shrink:0">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
              stroke="var(--color-border)" stroke-width="${SW}"/>
      ${arcs}
      <text x="${CX}" y="${CY - 4}" text-anchor="middle"
            font-size="7" fill="var(--color-text-muted)" font-family="Sora,sans-serif">${cur}</text>
      <text x="${CX}" y="${CY + 9}" text-anchor="middle"
            font-size="11" font-weight="700" fill="var(--color-text)" font-family="Sora,sans-serif">${fmt}</text>
    </svg>`;
}


export const HomeScreen = {

  html() {
    const trips    = State.trips;
    const active   = trips.filter(t => !t.archivedAt);
    const archived = trips.filter(t =>  t.archivedAt);
    const f = d => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    const nArchived = archived.length;

    // ── Trip card ──────────────────────────────────────────
    const tripCard = t => {
      const total    = Selectors.tripTotalById(t.id);
      const nSpese   = Selectors.tripExpenseCountById(t.id);
      const typeInfo = tripTypeInfo(t.type ?? 'viaggio');
      const status   = _tripStatus(t, nSpese);
      const stateClass = t.archivedAt ? 'trip-card--archived' : 'trip-card--active';
      return `
        <div class="card trip-card ${stateClass}" data-action="open-trip" data-trip-id="${t.id}">
          <div class="trip-card__header">
            ${_compassSplit(t, total)}
            <div class="trip-card__info">
              <h2 class="trip-card__name">${typeInfo.icon} ${t.name}</h2>
              <p class="trip-card__sub">${t.location}</p>
              <p class="trip-card__dates">${f(t.startDate)} – ${f(t.endDate)}</p>
            </div>
            <span class="trip-status trip-status--${status.mod}">${status.label}</span>
          </div>
          <div class="trip-card__footer">
            <span class="trip-card__meta">
              ${t.participants.length} ${t.participants.length === 1 ? 'partecipante' : 'partecipanti'}
              · ${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}
            </span>
            <button class="trip-card__delete" data-action="delete-trip" data-trip-id="${t.id}"
                    aria-label="Elimina">🗑</button>
          </div>
        </div>`;
    };

    // ── Sections ──────────────────────────────────────────
    const activeSection = active.length
      ? active.map(tripCard).join('')
      : `<div class="empty-state">
           <p class="empty-state__icon">✈️</p>
           <p class="empty-state__text">Nessun evento ancora</p>
           <p class="empty-state__sub">Viaggi, serate, regate, festival… tutto qui</p>
           <button class="empty-state__cta" data-action="new-trip">Aggiungi evento</button>
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

        <!-- Hero: sticky compact topbar -->
        <header class="home-hero">
          <div class="home-hero__top">
            ${CambusaLogo({ size: '40px', onDark: true })}
            <div class="home-hero__title-wrap">
              <h1 class="home-hero__title">Cambusa</h1>
              <p class="home-hero__sub">Le tue spese condivise</p>
            </div>
            <button class="home-hero__add" data-action="new-trip" aria-label="Nuovo evento">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <line x1="5"  y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <main class="screen-content">

          ${activeSection}
          ${archivedSection}

          <div class="import-row">
            <label class="import-btn" title="Importa evento da file JSON">
              ⬆ Importa evento
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
        e.target.value = '';
      });

    document.getElementById('screen-home')?.addEventListener('click', e => {
      // Elimina viaggio
      const delBtn = e.target.closest('[data-action="delete-trip"]');
      if (delBtn) {
        e.stopPropagation();
        const tripId    = delBtn.dataset.tripId;
        const trip      = State.trips.find(t => t.id === tripId);
        const typeLabel = tripTypeInfo(trip?.type ?? 'viaggio').label;
        Modal.confirm({
          title:        `Elimina ${typeLabel}`,
          message:      `"${trip?.name ?? ''}" e tutte le sue spese verranno cancellati definitivamente.`,
          confirmLabel: 'Elimina',
          danger:       true,
          onConfirm: async () => {
            await Actions.deleteTrip(tripId);
            Toast.show(`${typeLabel} eliminato`, { type: 'info' });
            Router.go('home');
          },
        });
        return;
      }

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
        if (!trip) { Toast.show('Crea prima un evento', { type: 'info' }); return; }
        State.currentTrip = trip;
        Router.go(target, { tripId: trip.id });
        return;
      }
      Router.go(target);
    });
  },

  unmount() {},
};
