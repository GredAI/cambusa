/* =====================================================
   CAMBUSA — autoBackup.js
   Backup automatico silenzioso: una volta al giorno,
   dopo il primo salvataggio spesa, esporta il JSON
   con tutti i viaggi nella cartella Download.
   ===================================================== */

import { State }   from './state.js';
import { Actions } from './actions.js';
import { Toast }   from './toast.js';

const BACKUP_KEY = 'cambusa_last_autobackup';

/**
 * Esegue il backup automatico se non è ancora stato fatto oggi.
 * Chiamare dopo ogni salvataggio spesa riuscito.
 */
export async function maybeAutoBackup() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(BACKUP_KEY) === today) return; // già fatto oggi

  try {
    const trips = State.trips;
    if (!trips.length) return;

    const bundles = await Promise.all(trips.map(t => Actions.exportTrip(t.id)));
    const valid   = bundles.filter(r => r.ok).map(r => r.value);
    if (!valid.length) return;

    const json = JSON.stringify({ _cambusaBackup: true, trips: valid }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cambusa-autobackup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);

    localStorage.setItem(BACKUP_KEY, today);
    Toast.show('💾 Backup automatico salvato', { type: 'success' });
  } catch (err) {
    console.warn('[AutoBackup]', err);
  }
}
