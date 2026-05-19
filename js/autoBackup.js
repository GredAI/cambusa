/* =====================================================
   CAMBUSA — autoBackup.js
   Backup automatico silenzioso: una volta al giorno
   esporta il JSON di tutti i viaggi e lo conserva in
   localStorage, scaricabile dalla schermata Impostazioni.

   Trigger: avvio app (app.js) + dopo ogni salvataggio spesa.
   ===================================================== */

import { State }   from './state.js';
import { Actions } from './actions.js';
import { Toast }   from './toast.js';

const BACKUP_TS_KEY   = 'cambusa_last_autobackup_ts';  // ISO timestamp
const BACKUP_DATA_KEY = 'cambusa_cached_backup';        // JSON string

// ── Trigger giornaliero ───────────────────────────────
/**
 * Esegue il backup automatico se non è ancora stato fatto oggi.
 * Sicuro da chiamare più volte — la guardia evita duplicati.
 */
export async function maybeAutoBackup() {
  const today   = new Date().toISOString().slice(0, 10);
  const lastTs  = localStorage.getItem(BACKUP_TS_KEY) ?? '';
  const lastDay = lastTs.slice(0, 10);

  if (lastDay === today) return; // già fatto oggi

  try {
    const trips = State.trips;
    if (!trips.length) return;

    const bundles = await Promise.all(trips.map(t => Actions.exportTrip(t.id)));
    const valid   = bundles.filter(r => r.ok).map(r => r.value);
    if (!valid.length) return;

    const json = JSON.stringify({ _cambusaBackup: true, trips: valid }, null, 2);
    localStorage.setItem(BACKUP_DATA_KEY, json);
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());

    Toast.show('💾 Backup aggiornato — scaricabile da Impostazioni', { type: 'success' });
  } catch (err) {
    console.warn('[AutoBackup]', err);
  }
}

// ── Info ──────────────────────────────────────────────
/**
 * Restituisce le info sull'ultimo backup disponibile.
 * @returns {{ hasBackup: boolean, dateLabel?: string, sizeKb?: number }}
 */
export function getLastBackupInfo() {
  const ts   = localStorage.getItem(BACKUP_TS_KEY);
  const json = localStorage.getItem(BACKUP_DATA_KEY);
  if (!ts || !json) return { hasBackup: false };

  const d         = new Date(ts);
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const bDate     = d.toISOString().slice(0, 10);
  const timeStr   = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const sizeKb    = Math.round(json.length / 1024);

  let dateLabel;
  if (bDate === today) {
    dateLabel = `oggi alle ${timeStr}`;
  } else if (bDate === yesterday) {
    dateLabel = `ieri alle ${timeStr}`;
  } else {
    const dStr = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    dateLabel  = `${dStr} alle ${timeStr}`;
  }

  return { hasBackup: true, dateLabel, sizeKb };
}

// ── Download ──────────────────────────────────────────
/**
 * Scarica l'ultimo backup dalla cache localStorage.
 * Usa link temporaneo (funziona su Safari da user gesture).
 * @returns {boolean} true se il download è stato avviato
 */
export function downloadLastBackup() {
  const json = localStorage.getItem(BACKUP_DATA_KEY);
  if (!json) return false;

  const ts    = localStorage.getItem(BACKUP_TS_KEY) ?? new Date().toISOString();
  const fname = `cambusa-backup-${ts.slice(0, 10)}.json`;

  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);

  return true;
}
