/* =====================================================
   CAMBUSA — charts.js
   Schermata grafici: categoria, persona, andamento.

   Tutti i grafici sono SVG inline — zero dipendenze,
   funzionano offline, rispettano il design system.
   ===================================================== */

import { State }     from '../state.js';
import { Router }    from '../router.js';
import { Selectors } from '../selectors.js';
import { Topbar }    from '../ui.js';
import { Guards }    from '../domain/guards.js';
import { readAmount, readConsumers, isGroupExpense } from '../domain/guards.js';

// ── Colori categorie (brand palette) ─────────────────
const CAT_COLOR = {
  alloggio:  '#d4a96a',
  trasporti: '#3b82f6',
  noleggi:   '#f97316',
  cibo:      '#2fa7a0',
  spesa:     '#10b981',
  attivita:  '#8b5cf6',
  servizi:   '#6b7280',
  altro:     '#93b0b9',
};
const CAT_LABEL = {
  alloggio: 'Alloggio', trasporti: 'Trasporti', noleggi: 'Noleggi',
  cibo: 'Cibo', spesa: 'Spesa', attivita: 'Attività',
  servizi: 'Servizi', altro: 'Altro',
};

// ── Helpers ───────────────────────────────────────────
function _fmt(cents) {
  if (cents >= 100000) return `${(cents / 100000).toFixed(1)}k`;
  return (cents / 100).toFixed(0);
}
function _fmtFull(cents) {
  return (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _cur(trip) { return trip?.currency ?? '€'; }

// ── 1. Grafico donut — Spese per categoria ────────────
function _donutChart(catTotals, cur) {
  const entries = Object.entries(catTotals).sort(([, a], [, b]) => b - a);
  const total   = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return '<p class="chart-empty">Nessuna spesa ancora.</p>';

  const CX = 90, CY = 90, R = 68, STROKE = 22;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const arcs = entries.map(([cat, value]) => {
    const pct  = value / total;
    const dash = pct * circumference;
    const arc  = `
      <circle cx="${CX}" cy="${CY}" r="${R}"
        fill="none"
        stroke="${CAT_COLOR[cat] ?? '#93b0b9'}"
        stroke-width="${STROKE}"
        stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${CX} ${CY})"
        class="donut-arc"
        data-cat="${cat}"
      />`;
    offset += dash;
    return arc;
  }).join('');

  const legend = entries.map(([cat, value]) => `
    <div class="donut-legend-row">
      <span class="donut-legend-dot" style="background:${CAT_COLOR[cat] ?? '#93b0b9'}"></span>
      <span class="donut-legend-label">${CAT_LABEL[cat] ?? cat}</span>
      <span class="donut-legend-pct">${Math.round(value / total * 100)}%</span>
      <span class="donut-legend-amt">${cur} ${_fmtFull(value)}</span>
    </div>`).join('');

  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 180 180" width="180" height="180" style="flex-shrink:0">
        <!-- Sfondo neutro -->
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="var(--color-border)" stroke-width="${STROKE}" />
        ${arcs}
        <!-- Testo centrale -->
        <text x="${CX}" y="${CY - 8}" text-anchor="middle"
              font-size="11" fill="var(--color-text-muted)" font-family="Sora,sans-serif">
          Totale
        </text>
        <text x="${CX}" y="${CY + 10}" text-anchor="middle"
              font-size="14" font-weight="700" fill="var(--color-text)" font-family="Sora,sans-serif">
          ${cur} ${_fmt(total)}
        </text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

// ── 2. Barre orizzontali — Spese per persona ──────────
function _personBars(trip) {
  const expenses  = State.expenses.filter(isGroupExpense);
  const totals    = {};

  for (const e of expenses) {
    const consumers = readConsumers(e);
    const amount    = readAmount(e);
    const totalShares = consumers.reduce((s, c) => s + (c.shares ?? 0), 0);
    for (const c of consumers) {
      const share = totalShares > 0
        ? Math.round(amount * (c.shares ?? 0) / totalShares)
        : 0;
      totals[c.participantId] = (totals[c.participantId] ?? 0) + share;
    }
  }

  const entries = trip.participants
    .map(p => ({ p, value: totals[p.id] ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const max = entries[0]?.value ?? 1;
  if (!max) return '<p class="chart-empty">Nessuna spesa ancora.</p>';

  const cur = _cur(trip);
  return entries.map(({ p, value }) => {
    const pct = max > 0 ? Math.round(value / max * 100) : 0;
    return `
      <div class="pbar-row">
        <span class="pbar-name">${p.name.split(' ')[0]}</span>
        <div class="pbar-track">
          <div class="pbar-fill" style="width:${pct}%;background:${p.color ?? 'var(--color-primary)'}"></div>
        </div>
        <span class="pbar-amt">${cur} ${_fmtFull(value)}</span>
      </div>`;
  }).join('');
}

// ── 3. Barre temporali — Andamento spese ─────────────
function _timelineBars(trip) {
  const expenses = State.expenses.filter(isGroupExpense);
  if (!expenses.length) return '<p class="chart-empty">Nessuna spesa ancora.</p>';

  // Raggruppa per settimana (o per giorno se <= 14 giorni)
  const dates = expenses.map(e => e.date).sort();
  const first = new Date(dates[0]);
  const last  = new Date(dates[dates.length - 1]);
  const span  = (last - first) / (1000 * 60 * 60 * 24); // giorni

  const useWeeks = span > 21;
  const buckets  = {};

  for (const e of expenses) {
    const d   = new Date(e.date);
    let key;
    if (useWeeks) {
      // Lunedì della settimana
      const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const mon = new Date(d);
      mon.setDate(d.getDate() - day);
      key = mon.toISOString().slice(0, 10);
    } else {
      key = e.date;
    }
    buckets[key] = (buckets[key] ?? 0) + readAmount(e);
  }

  const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  const maxVal = Math.max(...sorted.map(([, v]) => v));
  const cur    = _cur(trip);
  const CHART_H = 80;

  const BAR_W = Math.max(18, Math.min(36, Math.floor(280 / sorted.length) - 4));
  const total_w = sorted.length * (BAR_W + 4);
  const svgW = Math.max(total_w + 20, 300);

  const bars = sorted.map(([key, value], i) => {
    const barH  = maxVal > 0 ? Math.round(value / maxVal * CHART_H) : 0;
    const x     = 10 + i * (BAR_W + 4);
    const y     = 10 + CHART_H - barH;
    const label = useWeeks
      ? new Date(key).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
      : new Date(key).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    return `
      <g>
        <rect x="${x}" y="${y}" width="${BAR_W}" height="${barH}"
              rx="4" fill="var(--color-primary)" opacity="0.85"/>
        <text x="${x + BAR_W / 2}" y="${10 + CHART_H + 14}" text-anchor="middle"
              font-size="9" fill="var(--color-text-muted)" font-family="Sora,sans-serif">
          ${label}
        </text>
        <title>${cur} ${_fmtFull(value)}</title>
      </g>`;
  }).join('');

  return `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <svg viewBox="0 0 ${svgW} ${CHART_H + 32}" width="${svgW}" height="${CHART_H + 32}"
           style="min-width:${svgW}px">
        ${bars}
      </svg>
    </div>
    <p class="chart-axis-label">${useWeeks ? 'per settimana' : 'per giorno'}</p>`;
}

// ── Screen export ─────────────────────────────────────
export const ChartsScreen = {

  html() {
    const trip = State.currentTrip;
    if (!trip) return '<p class="error">Evento non trovato.</p>';

    const catTotals = Selectors.categoryTotals();
    const cur       = _cur(trip);

    return `
      <div class="screen" id="screen-charts">
        ${Topbar({
          title:    'Grafici',
          subtitle: trip.name,
          back:     true,
          backNav:  'trip',
        })}
        <main class="screen-content">

          <div class="card chart-card">
            <h3 class="chart-title">Spese per categoria</h3>
            ${_donutChart(catTotals, cur)}
          </div>

          <div class="card chart-card">
            <h3 class="chart-title">Consumato per persona</h3>
            <div class="pbar-list">
              ${_personBars(trip)}
            </div>
          </div>

          <div class="card chart-card">
            <h3 class="chart-title">Andamento spese</h3>
            ${_timelineBars(trip)}
          </div>

        </main>
      </div>`;
  },

  mount() {
    document.getElementById('screen-charts')
      ?.addEventListener('click', e => {
        if (e.target.closest('.btn-back')) {
          Router.go('trip', { tripId: State.currentTrip?.id });
        }
      });
  },

  unmount() {},
};
