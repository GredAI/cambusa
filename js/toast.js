/* =====================================================
   CAMBUSA — toast.js
   Sistema toast/snackbar leggero.

   USO
   ─────────────────────────────────────────────────────
   Toast.show('Spesa salvata')
   Toast.show('Eliminata', { type: 'error', undo: () => Actions.restore(...) })
   Toast.show('Pagamento registrato', { type: 'success' })

   TIPI: 'success' (default) | 'error' | 'info'
   ===================================================== */

const ROOT      = () => document.getElementById('toast-root');
const DURATION  = 3200;  // ms prima dell'auto-dismiss

export const Toast = {

  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {'success'|'error'|'info'} [opts.type='success']
   * @param {Function} [opts.undo]   — se presente mostra bottone "Annulla"
   * @param {number}   [opts.duration]
   */
  show(message, opts = {}) {
    const { type = 'success', undo, duration = DURATION } = opts;
    const root = ROOT();
    if (!root) return;

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__msg">${message}</span>
      ${undo ? `<button class="toast__undo">Annulla</button>` : ''}
    `;

    // Undo
    if (undo) {
      el.querySelector('.toast__undo').addEventListener('click', () => {
        undo();
        _dismiss(el);
      });
    }

    root.appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => el.classList.add('toast--visible'));

    // Auto dismiss
    const timer = setTimeout(() => _dismiss(el), duration);
    el._dismissTimer = timer;
  },
};

function _dismiss(el) {
  clearTimeout(el._dismissTimer);
  el.classList.remove('toast--visible');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}
