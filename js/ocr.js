/* =====================================================
   CAMBUSA — ocr.js
   Wrapper intorno a Tesseract.js (lazy-load da CDN).

   USO
   ─────────────────────────────────────────────────────
   import { OCR } from './ocr.js';
   const text = await OCR.recognize(file, pct => console.log(pct));
   ===================================================== */

const TESSERACT_CDN =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// Lingua: italiano + inglese per coprire loghi e prezzi misti
const LANG = 'ita+eng';

let _scriptLoaded = false;

// ── Caricamento CDN (idempotente) ──────────────────────
async function _ensureLoaded() {
  if (_scriptLoaded || window.Tesseract) { _scriptLoaded = true; return; }

  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src     = TESSERACT_CDN;
    s.onload  = () => { _scriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Tesseract.js non caricabile (rete assente?)'));
    document.head.appendChild(s);
  });
}

// ── API pubblica ───────────────────────────────────────
export const OCR = {

  /**
   * Esegue OCR su un File immagine.
   *
   * @param {File}     imageFile  — da <input type="file">
   * @param {Function} onProgress — callback(0–100)
   * @returns {Promise<string>}   — testo estratto
   */
  async recognize(imageFile, onProgress) {
    await _ensureLoaded();

    const worker = await window.Tesseract.createWorker(LANG, 1, {
      logger(m) {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress ?? 0) * 100));
        }
      },
    });

    try {
      const result = await worker.recognize(imageFile);
      return result.data.text ?? '';
    } finally {
      await worker.terminate();
    }
  },

  /** Vero se Tesseract è già caricato (senza scaricare nulla) */
  isLoaded() {
    return _scriptLoaded || !!window.Tesseract;
  },
};
