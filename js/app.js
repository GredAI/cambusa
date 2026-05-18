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
import { Render, applyTheme } from './ui.js';

import { HomeScreen }        from './screens/home.js';
import { TripScreen }        from './screens/trip.js';
import { ExpensesScreen }    from './screens/expenses.js';
import { BalancesScreen }    from './screens/balances.js';
import { NewExpenseScreen }  from './screens/newExpense.js';
import { TripFormScreen }    from './screens/tripForm.js';
import { SettingsScreen }    from './screens/settings.js';
import { OnboardingScreen }    from './screens/onboarding.js';
import { ReceiptScannerScreen } from './screens/receiptScanner.js';

// ── Registra le schermate ─────────────────────────────────
Router._screens = {
  'home':             HomeScreen,
  'trip':             TripScreen,
  'expenses':         ExpensesScreen,
  'balances':         BalancesScreen,
  'new-expense':      NewExpenseScreen,
  'trip-form':        TripFormScreen,
  'settings':         SettingsScreen,
  'onboarding':       OnboardingScreen,
  'receipt-scanner':  ReceiptScannerScreen,
};

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  // updateViaCache:'none' impedisce a Safari di cacheare sw.js via HTTP
  // senza questa opzione Safari non rileva mai i nuovi deployment
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('[SW] Registrato:', reg.scope);
        // Forza subito il controllo aggiornamenti
        reg.update().catch(() => {});
        // Se c'è già un SW in attesa, attivalo subito
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Intercetta nuovi SW trovati durante la sessione
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(e => console.warn('[SW] Errore:', e));

    // Ricarica la pagina quando il nuovo SW prende il controllo
    // così il browser carica i JS/CSS aggiornati
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Nuovo SW attivo — ricarico');
      window.location.reload();
    });
  });
}

// ── Boot asincrono ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await Actions.init();          // DB → migrazione → cache → seed
    applyTheme(State.settings?.theme ?? 'light');

    // Mostra onboarding solo ai nuovi utenti (nessun viaggio esistente)
    // Gli utenti esistenti che non hanno ancora onboardingCompleted
    // vengono aggiornati silenziosamente e vanno direttamente a home.
    const settings = State.settings ?? {};
    if (!settings.onboardingCompleted && State.trips.length === 0) {
      Router.go('onboarding');
    } else {
      if (!settings.onboardingCompleted) {
        await Actions.saveSettings({ onboardingCompleted: true });
      }
      Router.go('home');           // prima schermata
    }

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
