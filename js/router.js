/* =====================================================
   CAMBUSA — router.js
   Router.go() è l'unico modo per cambiare schermata.
   Prima di renderizzare pre-carica le spese e i saldi
   confermati per le schermate che ne hanno bisogno.
   ===================================================== */

import { State }   from './state.js';
import { Actions } from './actions.js';
import { Render }  from './ui.js';

// Schermate che richiedono expenses + settlements in State
const TRIP_SCREENS = new Set(['trip', 'expenses', 'balances', 'new-expense', 'receipt-scanner']);

export const Router = {

  // Popolato da app.js per evitare dipendenze circolari
  _screens: {},

  async go(screenName, params = {}) {
    State.currentScreen = screenName;
    State.params        = params;

    if (params.tripId) {
      State.currentTrip = State.trips.find(t => t.id === params.tripId) ?? null;
    }

    // Pre-carica dati prima del render — gli screen restano sincroni
    if (params.tripId && TRIP_SCREENS.has(screenName)) {
      await Actions.loadExpenses(params.tripId);
      await Actions.loadSettlements(params.tripId);
    }

    const Screen = this._screens[screenName];
    if (!Screen) {
      console.warn('[Router] Screen non trovata:', screenName);
      return;
    }
    Render.screen(Screen);
  },
};
