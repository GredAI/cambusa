/* =====================================================
   CAMBUSA — app.js
   Entry point. Boot asincrono: Actions.init() apre
   IndexedDB, migra dati v1→v2 se necessario, carica
   i trip in State, poi avvia il router.
   Nessuna logica qui: solo cablaggio.
   ===================================================== */

import { Actions }          from './actions.js';
import { State }            from './state.js';
import { Router }           from './router.js';
import { Render }           from './ui.js';

import { HomeScreen }        from './screens/home.js';
import { TripScreen }        from './screens/trip.js';
import { ExpensesScreen }    from './screens/expenses.js';
import { BalancesScreen }    from './screens/balances.js';
import { NewExpenseScreen }  from './screens/newExpense.js';
import { TripFormScreen }    from './screens/tripForm.js';
import { SettingsScreen }    from './screens/settings.js';

// ── Registra le schermate ─────────────────────────────────
Router._screens = {
  'home':         HomeScreen,
  'trip':         TripScreen,
  'expenses':     ExpensesScreen,
  'balances':     BalancesScreen,
  'new-expense':  NewExpenseScreen,
  'trip-form':    TripFormScreen,
  'settings':     SettingsScreen,
};

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(r  => console.log('[SW] Registrato:', r.scope))
      .catch(e => console.warn('[SW] Errore:', e));
  });
}

// ── Boot asincrono ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await Actions.init();          // DB → migrazione → cache → seed
    Router.go('home');             // prima schermata
    console.log('[Cambusa] ✓ Pronta');
  } catch (err) {
    console.error('[Cambusa] Errore avvio:', err);
    document.getElementById('app').innerHTML =
      `<p style="padding:40px;color:#ef4444">Errore avvio: ${err.message}</p>`;
  }
});

// ── Debug globale (console del browser) ──────────────────
window.Actions = Actions;
window.State   = State;
window.Router  = Router;
window.Render  = Render;
