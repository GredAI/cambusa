/* =====================================================
   CAMBUSA — settings.js
   Preferenze, gestione dati, info app.
   ===================================================== */

import { State }   from '../state.js';
import { Actions } from '../actions.js';
import { Router }  from '../router.js';
import { Topbar, BottomNav, applyTheme } from '../ui.js';
import { Toast }   from '../toast.js';
import { getLastBackupInfo, downloadLastBackup, maybeAutoBackup } from '../autoBackup.js';

const APP_VERSION = 'v117';

const CURRENCIES = ['€', '$', '£', 'CHF', '¥', 'kr'];

/**
 * Download compatibile Safari — usa data URI invece di blob URL.
 * In PWA mode su iOS il blob createObjectURL viene bloccato.
 */
function _safariDownload(jsonString, filename) {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export const SettingsScreen = {

  html() {
    const settings   = State.settings ?? {};
    const defCur     = settings.defaultCurrency ?? '€';
    const theme      = settings.theme ?? 'light';
    const nTrips     = State.trips.length;
    const nActive    = State.trips.filter(t => !t.archivedAt).length;
    const nArch      = nTrips - nActive;
    const backupInfo = getLastBackupInfo();

    const curChips = CURRENCIES.map(c => `
      <button class="filter-chip ${c === defCur ? 'filter-chip--active' : ''}"
              data-action="set-currency" data-currency="${c}">
        ${c}
      </button>`).join('');

    return `
      <div class="screen" id="screen-settings">
        ${Topbar({ title: 'Altro', subtitle: 'Impostazioni e dati' })}

        <main class="screen-content">

          <!-- Preferenze -->
          <div class="card">
            <div class="section-header">
              <span class="section-title">Valuta di default</span>
            </div>
            <p class="field-hint" style="text-align:left;padding:4px 0 10px">
              Usata per i nuovi viaggi
            </p>
            <div class="filter-row">${curChips}</div>

            <div class="section-header" style="margin-top:6px">
              <span class="section-title">Tema</span>
            </div>
            <div class="filter-row">
              <button class="filter-chip ${theme === 'light' ? 'filter-chip--active' : ''}"
                      data-action="set-theme" data-theme="light">
                ☀️ Chiaro
              </button>
              <button class="filter-chip ${theme === 'dark' ? 'filter-chip--active' : ''}"
                      data-action="set-theme" data-theme="dark">
                🌙 Scuro
              </button>
            </div>
          </div>

          <!-- Dati -->
          <div class="card">
            <div class="section-header">
              <span class="section-title">I tuoi dati</span>
              <span class="topbar__badge">${nTrips} ${nTrips === 1 ? 'viaggio' : 'viaggi'}</span>
            </div>
            <p class="field-hint" style="text-align:left;padding:4px 0 10px">
              ${nActive} attivi · ${nArch} archiviati
            </p>

            <!-- Auto-backup -->
            <div class="backup-status-row">
              <div class="backup-status-info">
                <span class="backup-status-icon">💾</span>
                <div>
                  <p class="backup-status-title">Auto-backup giornaliero</p>
                  <p class="backup-status-sub">
                    ${backupInfo.hasBackup
                      ? `Ultimo: ${backupInfo.dateLabel} · ${backupInfo.sizeKb} KB`
                      : 'Nessun backup ancora — avviene al primo utilizzo'}
                  </p>
                </div>
              </div>
              ${backupInfo.hasBackup ? `
                <button class="backup-dl-btn" data-action="download-autobackup"
                        title="Scarica ultimo backup">
                  ⬇
                </button>` : ''}
            </div>

            <!-- Esporta manuale -->
            <p class="field-hint" style="text-align:left;padding:6px 0 6px;font-weight:600">Esporta</p>
            <div class="export-row">
              <button class="export-btn" data-action="export-all">
                ⬇ Salva file
              </button>
              <button class="export-btn" data-action="copy-json">
                📋 Copia JSON
              </button>
            </div>

            <!-- Importa -->
            <p class="field-hint" style="text-align:left;padding:10px 0 6px;font-weight:600">Importa</p>
            <div class="export-row">
              <label class="export-btn" title="Importa da file JSON">
                📂 Scegli file
                <input type="file" id="input-settings-import"
                       accept=".json" style="display:none" />
              </label>
            </div>
            <div style="margin-top:8px">
              <textarea id="input-paste-json"
                        rows="4"
                        placeholder="Oppure incolla qui il testo JSON del backup…"
                        style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1.5px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:13px;resize:vertical;font-family:monospace"></textarea>
              <button class="export-btn" data-action="import-pasted-json"
                      style="margin-top:6px;width:100%">
                ✓ Importa da testo
              </button>
            </div>
          </div>

          <!-- Zona pericolosa -->
          <div class="card">
            <div class="section-header">
              <span class="section-title">Zona pericolosa</span>
            </div>
            <p class="field-hint" style="text-align:left;padding:4px 0 10px">
              Le operazioni di seguito non sono reversibili.
            </p>
            <button class="delete-trip-btn" data-action="reset-all">
              🗑 Cancella tutti i dati
            </button>
          </div>

          <!-- Info -->
          <div class="card" style="gap:6px">
            <div class="section-header">
              <span class="section-title">Info</span>
              <span class="topbar__badge">${APP_VERSION}</span>
            </div>
            <p class="field-hint" style="text-align:left;padding:2px 0">
              Cambusa — gestione spese condivise per viaggi
            </p>
            <p class="field-hint" style="text-align:left">
              Dati salvati localmente sul dispositivo.
              Nessun account richiesto.
            </p>
          </div>

        </main>
        ${BottomNav('settings')}
      </div>`;
  },

  mount() {
    const screen = document.getElementById('screen-settings');
    if (!screen) return;

    // Import file (supporta sia singolo viaggio che backup multi-viaggio)
    document.getElementById('input-settings-import')
      ?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text   = await file.text();
          const parsed = JSON.parse(text);

          // Backup multi-viaggio: { _cambusaBackup: true, trips: [...bundles] }
          if (parsed._cambusaBackup && Array.isArray(parsed.trips)) {
            let imported = 0;
            for (const bundle of parsed.trips) {
              const result = await Actions.importTrip(bundle);
              if (result.ok) imported++;
            }
            if (!imported) {
              Toast.show('Nessun viaggio importato', { type: 'error' });
            } else {
              Toast.show(`✓ ${imported} viaggio/i importati`, { type: 'success' });
              Router.go('home');
            }

          } else {
            // Singolo viaggio: { _cambusa: true, trip, expenses, settlements }
            const result = await Actions.importTrip(parsed);
            if (!result.ok) {
              Toast.show('File non valido', { type: 'error' });
              return;
            }
            Toast.show(`✓ "${result.value.trip.name}" importato`, { type: 'success' });
            Router.go('home');
          }
        } catch {
          Toast.show('Errore lettura file', { type: 'error' });
        }
        e.target.value = '';
      });

    screen.addEventListener('click', async e => {

      // Scarica ultimo auto-backup
      if (e.target.closest('[data-action="download-autobackup"]')) {
        const ok = downloadLastBackup();
        if (ok) {
          Toast.show('⬇ Download avviato', { type: 'success' });
        } else {
          Toast.show('Nessun backup disponibile', { type: 'info' });
        }
        return;
      }

      // Valuta di default
      const curBtn = e.target.closest('[data-action="set-currency"]');
      if (curBtn) {
        const currency = curBtn.dataset.currency;
        await Actions.saveSettings({ defaultCurrency: currency });
        screen.querySelectorAll('[data-action="set-currency"]').forEach(b => {
          b.classList.toggle('filter-chip--active', b.dataset.currency === currency);
        });
        Toast.show(`Valuta impostata: ${currency}`, { type: 'success' });
        return;
      }

      // Tema chiaro / scuro
      const themeBtn = e.target.closest('[data-action="set-theme"]');
      if (themeBtn) {
        const newTheme = themeBtn.dataset.theme;
        await Actions.saveSettings({ theme: newTheme });
        applyTheme(newTheme);
        screen.querySelectorAll('[data-action="set-theme"]').forEach(b => {
          b.classList.toggle('filter-chip--active', b.dataset.theme === newTheme);
        });
        Toast.show(newTheme === 'dark' ? '🌙 Tema scuro attivo' : '☀️ Tema chiaro attivo', { type: 'success' });
        return;
      }

      // Backup JSON tutti i viaggi
      if (e.target.closest('[data-action="export-all"]')) {
        try {
          const trips = State.trips;
          if (!trips.length) {
            Toast.show('Nessun viaggio da esportare', { type: 'info' });
            return;
          }
          const bundles = await Promise.all(trips.map(t => Actions.exportTrip(t.id)));
          const valid   = bundles.filter(r => r.ok).map(r => r.value);
          const json    = JSON.stringify({ _cambusaBackup: true, trips: valid }, null, 2);
          const fname   = `cambusa-backup-${new Date().toISOString().slice(0, 10)}.json`;
          _safariDownload(json, fname);
          Toast.show(`✓ ${valid.length} viaggio/i esportati`, { type: 'success' });
        } catch (err) {
          Toast.show('Errore export', { type: 'error' });
        }
        return;
      }

      // Copia JSON negli appunti (Safari-safe, non richiede filesystem)
      if (e.target.closest('[data-action="copy-json"]')) {
        try {
          const trips = State.trips;
          if (!trips.length) {
            Toast.show('Nessun viaggio da copiare', { type: 'info' });
            return;
          }
          const bundles = await Promise.all(trips.map(t => Actions.exportTrip(t.id)));
          const valid   = bundles.filter(r => r.ok).map(r => r.value);
          const json    = JSON.stringify({ _cambusaBackup: true, trips: valid }, null, 2);
          await navigator.clipboard.writeText(json);
          Toast.show('📋 JSON copiato negli appunti — incollalo in Note o Messages per conservarlo', { type: 'success' });
        } catch (err) {
          Toast.show('Errore copia — prova con "Salva file"', { type: 'error' });
        }
        return;
      }

      // Importa da testo JSON incollato nella textarea
      if (e.target.closest('[data-action="import-pasted-json"]')) {
        const text = document.getElementById('input-paste-json')?.value?.trim();
        if (!text) {
          Toast.show('Incolla prima il testo JSON', { type: 'info' });
          return;
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed._cambusaBackup && Array.isArray(parsed.trips)) {
            let imported = 0;
            for (const bundle of parsed.trips) {
              const result = await Actions.importTrip(bundle);
              if (result.ok) imported++;
            }
            if (!imported) {
              Toast.show('Nessun viaggio importato', { type: 'error' });
            } else {
              Toast.show(`✓ ${imported} viaggio/i importati`, { type: 'success' });
              Router.go('home');
            }
          } else if (parsed._cambusa) {
            const result = await Actions.importTrip(parsed);
            if (!result.ok) {
              Toast.show('Testo non valido', { type: 'error' });
              return;
            }
            Toast.show(`✓ "${result.value.trip.name}" importato`, { type: 'success' });
            Router.go('home');
          } else {
            Toast.show('Formato JSON non riconosciuto', { type: 'error' });
          }
        } catch {
          Toast.show('Testo non valido — assicurati di aver copiato tutto il JSON', { type: 'error' });
        }
        return;
      }

      // Reset completo
      if (e.target.closest('[data-action="reset-all"]')) {
        const confirmed = window.confirm(
          'Cancellare TUTTI i viaggi e le spese? Questa operazione non è reversibile.'
        );
        if (!confirmed) return;
        try {
          // Cancella ogni viaggio tramite Actions
          for (const trip of [...State.trips]) {
            await Actions.deleteTrip(trip.id);
          }
          Toast.show('Tutti i dati cancellati', { type: 'success' });
          Router.go('home');
        } catch (err) {
          Toast.show('Errore durante la cancellazione', { type: 'error' });
        }
        return;
      }

      // Bottom nav
      const btn = e.target.closest('[data-nav]');
      if (!btn) return;
      const target = btn.dataset.nav;
      if (['new-expense', 'expenses', 'balances'].includes(target)) {
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
