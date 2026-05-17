/* =====================================================
   CAMBUSA — onboarding.js
   Schermata di benvenuto al primo avvio.
   Mostrata solo se onboardingCompleted === false
   e nessun viaggio esistente.
   ===================================================== */

import { Actions }      from '../actions.js';
import { Router }       from '../router.js';
import { CambusaLogo }  from '../ui.js';

export const OnboardingScreen = {

  html() {
    return `
      <div class="screen" id="screen-onboarding">
        <main class="screen-content onboarding-content">

          <!-- Hero -->
          <div class="onboarding-hero">
            <div class="onboarding-logo-wrap">
              ${CambusaLogo({ size: '96px', bg: '#ffffff', extraClass: 'onboarding-logo' })}
            </div>
            <h1 class="onboarding-title">Cambusa</h1>
            <p class="onboarding-tagline">La cassa comune dell'equipaggio</p>
            <p class="onboarding-sub">
              Spese condivise per i tuoi viaggi,<br>senza stress.
            </p>
          </div>

          <!-- Feature highlights -->
          <div class="onboarding-features">

            <div class="onboarding-feature">
              <span class="onboarding-feature__icon">🧾</span>
              <div class="onboarding-feature__text">
                <strong>Registra le spese</strong>
                <p>Chi ha pagato, chi ha consumato e quanto.</p>
              </div>
            </div>

            <div class="onboarding-feature">
              <span class="onboarding-feature__icon">💰</span>
              <div class="onboarding-feature__text">
                <strong>Calcola i saldi</strong>
                <p>Scopri chi deve cosa a chi con un click.</p>
              </div>
            </div>

            <div class="onboarding-feature">
              <span class="onboarding-feature__icon">📤</span>
              <div class="onboarding-feature__text">
                <strong>Esporta e condividi</strong>
                <p>Backup JSON e report HTML per il gruppo.</p>
              </div>
            </div>

          </div>

          <!-- Footer + CTA -->
          <div class="onboarding-footer">
            <p class="onboarding-privacy">
              I dati restano sul tuo dispositivo.<br>
              Nessun account richiesto.
            </p>
            <button class="save-btn onboarding-cta" data-action="start">
              Crea il tuo primo viaggio →
            </button>
          </div>

        </main>
      </div>`;
  },

  mount() {
    const screen = document.getElementById('screen-onboarding');
    if (!screen) return;

    screen.addEventListener('click', async e => {
      if (!e.target.closest('[data-action="start"]')) return;
      await Actions.saveSettings({ onboardingCompleted: true });
      Router.go('trip-form');
    });
  },

  unmount() {},
};
