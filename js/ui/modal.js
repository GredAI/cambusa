/* =====================================================
   CAMBUSA — ui/modal.js
   Bottom sheet mobile-first. Una alla volta.

   API
   ─────────────────────────────────────────────────────
   Modal.confirm({ title, message, confirmLabel, danger, onConfirm, onCancel })
   Modal.sheet({ title, body, actions: [{ label, type, onClick }] })
   Modal.close()

   TIPI ACTION
   ─────────────────────────────────────────────────────
   'cancel'  → grigio neutro
   'primary' → verde
   'danger'  → rosso
   ===================================================== */

const ROOT = () => document.getElementById('modal-root');

let _callbacks  = {};
let _escHandler = null;

// ── Scroll lock ───────────────────────────────────────
// iOS Safari ignora overflow:hidden sul body.
// La tecnica affidabile: fissa il body in posizione e
// ripristina lo scroll esatto alla chiusura.
function _lockScroll() {
  if (document.body.dataset.scrollLocked) return;  // già lockato
  const scrollY = window.scrollY;
  document.body.dataset.scrollLocked = '1';
  document.body.dataset.scrollY      = String(scrollY);
  document.body.style.position       = 'fixed';
  document.body.style.top            = `-${scrollY}px`;
  document.body.style.width          = '100%';
  document.body.style.overflowY      = 'scroll';  // evita layout shift
}

function _unlockScroll() {
  if (!document.body.dataset.scrollLocked) return;
  const scrollY = parseInt(document.body.dataset.scrollY ?? '0', 10);
  document.body.style.position  = '';
  document.body.style.top       = '';
  document.body.style.width     = '';
  document.body.style.overflowY = '';
  delete document.body.dataset.scrollLocked;
  delete document.body.dataset.scrollY;
  window.scrollTo(0, scrollY);
}

export const Modal = {

  /**
   * Bottom sheet di conferma.
   * Il bottone "Annulla" è sempre presente e chiude senza callback.
   */
  confirm({
    title,
    message,
    confirmLabel = 'Conferma',
    danger       = false,
    onConfirm,
    onCancel,
  }) {
    Modal.sheet({
      title,
      body: message
        ? `<p class="sheet-message">${message}</p>`
        : '',
      actions: [
        { label: 'Annulla',     type: 'cancel',                   onClick: onCancel  },
        { label: confirmLabel,  type: danger ? 'danger' : 'primary', onClick: onConfirm },
      ],
    });
  },

  /**
   * Bottom sheet generico con body HTML e array di actions.
   */
  sheet({ title, body = '', actions = [] }) {
    const root = ROOT();
    if (!root) return;

    // Chiudi eventuale sheet già aperta
    Modal._clearDOM();

    const actionsHtml = actions.map(a => `
      <button class="sheet-btn sheet-btn--${a.type}" data-action="${a.type}">
        ${a.label}
      </button>`).join('');

    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="bottom-sheet">
          <div class="bottom-sheet__handle"></div>
          ${title ? `
            <div class="bottom-sheet__header">
              <h3 class="bottom-sheet__title">${title}</h3>
            </div>` : ''}
          ${body ? `<div class="bottom-sheet__body">${body}</div>` : ''}
          ${actions.length ? `<div class="sheet-actions">${actionsHtml}</div>` : ''}
        </div>
      </div>`;

    // Salva callbacks per tipo
    _callbacks = {};
    actions.forEach(a => { if (a.onClick) _callbacks[a.type] = a.onClick; });

    // Backdrop click → chiudi
    const backdrop = root.querySelector('#modal-backdrop');
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) Modal.close();
    });

    // Bottoni
    root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cb = _callbacks[btn.dataset.action];
        Modal.close();
        cb?.();
      });
    });

    // Escape
    _escHandler = e => { if (e.key === 'Escape') Modal.close(); };
    document.addEventListener('keydown', _escHandler);

    // Blocca scroll body (iOS Safari)
    _lockScroll();

    // Trigger animazione (doppio rAF per garantire il transition)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        backdrop.classList.add('modal-backdrop--visible')
      )
    );
  },

  /**
   * Bottom sheet con campo di testo.
   * onConfirm(value) — valore inserito (già trimmato)
   */
  prompt({ title, placeholder = '', value = '', confirmLabel = 'Salva', onConfirm, onCancel }) {
    const esc = (s) => (s ?? '').replace(/"/g, '&quot;');
    Modal.sheet({
      title,
      body: `<input id="modal-prompt-input" class="input"
                    type="text" placeholder="${esc(placeholder)}"
                    value="${esc(value)}"
                    style="margin-bottom:0" />`,
      actions: [
        { label: 'Annulla',    type: 'cancel',  onClick: onCancel },
        { label: confirmLabel, type: 'primary',  onClick: () => {
            const v = document.getElementById('modal-prompt-input')?.value.trim() ?? '';
            onConfirm?.(v);
          }},
      ],
    });
    // Enter → conferma, focus automatico
    setTimeout(() => {
      const el = document.getElementById('modal-prompt-input');
      if (!el) return;
      el.focus();
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = el.value.trim();
          Modal.close();
          onConfirm?.(v);
        }
      });
    }, 150);
  },

  close() {
    const backdrop = ROOT()?.querySelector('#modal-backdrop');
    if (!backdrop) return;

    if (_escHandler) {
      document.removeEventListener('keydown', _escHandler);
      _escHandler = null;
    }

    backdrop.classList.remove('modal-backdrop--visible');
    backdrop.addEventListener('transitionend', () => {
      Modal._clearDOM();
      _unlockScroll();
    }, { once: true });
  },

  _clearDOM() {
    const root = ROOT();
    if (root) root.innerHTML = '';
    _callbacks = {};
    _unlockScroll();  // fallback: garantisce unlock anche senza transitionend
  },
};
