/* =====================================================
   CAMBUSA — ocr.js
   Wrapper intorno a Tesseract.js (lazy-load da CDN).

   PREPROCESSING
   ─────────────────────────────────────────────────────
   Prima di dare l'immagine a Tesseract:
   • Ridimensiona se > 2000px (OCR non guadagna da immagini enormi)
   • Converte in scala di grigi
   • Aumenta il contrasto (ideale per scontrini su carta termica)
   Questo riduce drasticamente la varianza tra scansioni diverse.

   OPZIONI TESSERACT
   ─────────────────────────────────────────────────────
   PSM 4 = Single column of text (ottimo per scontrini)
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

// ── Preprocessing: grayscale + contrast boost ─────────
/**
 * Converte l'immagine in scala di grigi con contrasto aumentato.
 * Riduce drasticamente la varianza tra scansioni della stessa foto.
 *
 * @param {File|Blob} imageFile
 * @returns {Promise<Blob>} — PNG preprocessato
 */
async function _preprocessImage(imageFile) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(imageFile); // fallback: usa originale
    };

    img.onload = () => {
      try {
        // Ridimensiona se necessario
        const MAX_DIM = 2000;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Grayscale + contrast boost
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const CONTRAST = 1.6; // >1 = più contrasto (scontrini: testo nero su bianco)

        for (let i = 0; i < d.length; i += 4) {
          // Luminanza percettiva
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Stretch contrasto attorno a 128
          const out  = Math.max(0, Math.min(255, Math.round((gray - 128) * CONTRAST + 128)));
          d[i] = d[i + 1] = d[i + 2] = out;
          // d[i+3] (alpha) invariato
        }

        ctx.putImageData(imageData, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob(
          blob => resolve(blob ?? imageFile),
          'image/png'
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(imageFile); // fallback
      }
    };

    img.src = url;
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

    // Preprocessing prima di passare a Tesseract
    const processed = await _preprocessImage(imageFile);

    const worker = await window.Tesseract.createWorker(LANG, 1, {
      logger(m) {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress ?? 0) * 100));
        }
      },
    });

    try {
      // PSM 4 = Single column of text (ideale per scontrini)
      await worker.setParameters({ tessedit_pageseg_mode: '4' });
      const result = await worker.recognize(processed);
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
