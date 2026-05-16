/* =====================================================
   CAMBUSA — domain/ocrParser.js
   Estrae importo, titolo e categoria da testo OCR
   di uno scontrino italiano.

   STRATEGIA
   ─────────────────────────────────────────────────────
   1. Cerca il totale con pattern specifici scontrini IT
   2. Se non trovato, prende il numero decimale più alto
   3. Il nome del negozio è nelle prime righe leggibili
   4. La categoria è indovinata via keyword matching
   ===================================================== */

// ── Pattern totale ─────────────────────────────────────
const TOTAL_PATTERNS = [
  // "TOTALE  €  12.50" / "TOTALE EURO  12,50" / "TOTALE: 12.50"
  /(?:totale(?:\s*(?:euro|eur|€))?|total\s*(?:euro|eur|€)?)\s*[:\s]*(\d{1,5}[.,]\d{2})/i,
  // "TOT.  12,50" / "TOT €12.50"
  /\btot\.?\s*€?\s*(\d{1,5}[.,]\d{2})/i,
  // "IMPORTO  12,50"
  /\bimporto\s*[:\s]*(\d{1,5}[.,]\d{2})/i,
  // "€ 12,50" alla fine riga (spesso il totale)
  /€\s*(\d{1,5}[.,]\d{2})\s*$/m,
];

// ── Keyword → categoria ────────────────────────────────
const CATEGORY_RULES = [
  {
    cat: 'spesa',
    rx:  /supermercato|coop|esselunga|lidl|aldi|eurospin|md\b|pam\b|conad|carrefour|bennet|spesa|alimentari|discount|sigma\b|vegè/i,
  },
  {
    cat: 'cibo',
    rx:  /ristorante|pizzeria|trattoria|osteria|enoteca|gelateria|pasticceria|bar\b|caffè|cafe\b|caffetteria|tavola\s*calda|burger|kebab|sushi|pub\b|birreria/i,
  },
  {
    cat: 'alloggio',
    rx:  /hotel|albergo|hostel|b&b|bed\s*and\s*breakfast|agriturismo|pensione|inn\b|resort/i,
  },
  {
    cat: 'trasporti',
    rx:  /taxi|uber|trenitalia|italo\b|ntv\b|atm\b|atac\b|metro|autobus|bus\b|treno|volo|ryanair|easyjet|wizzair|ita\s*airways|blablacar|noleggio\s*auto/i,
  },
  {
    cat: 'noleggi',
    rx:  /noleggio|rent\s*a\s*car|hertz|avis|europcar|sixt|autonoleggio/i,
  },
  {
    cat: 'servizi',
    rx:  /farmacia|parafarmacia|medico|dottore|ospedale|clinica|dentista|ottico|lavanderia|tintoria/i,
  },
  {
    cat: 'attivita',
    rx:  /museo|teatro|cinema|concerto|biglietteria|parco|piscina|palestra|spa\b|escape\s*room|tour/i,
  },
];

// ── Helpers ────────────────────────────────────────────

function _parseAmount(str) {
  // Normalizza separatori: "1.234,56" → 1234.56  |  "12,50" → 12.50  |  "12.50" → 12.50
  const s = str.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{2})?$/.test(s)) {
    // Formato europeo con punti come separatori migliaia
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(s.replace(',', '.'));
}

function _cleanTitle(raw) {
  return raw
    .replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ &'.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function _guessCategory(text) {
  for (const { cat, rx } of CATEGORY_RULES) {
    if (rx.test(text)) return cat;
  }
  return 'altro';
}

// ── Export ─────────────────────────────────────────────

/**
 * Analizza il testo OCR di uno scontrino.
 *
 * @param {string} text
 * @returns {{ amount: number|null, title: string, category: string, raw: string }}
 */
export function parseReceipt(text) {
  if (!text) return { amount: null, title: '', category: 'altro', raw: '' };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Totale ──────────────────────────────────────────
  let amount = null;

  for (const pattern of TOTAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = _parseAmount(match[1]);
      if (parsed > 0 && parsed < 100_000) { amount = parsed; break; }
    }
  }

  // Fallback: il numero decimale più grande nel testo
  if (!amount) {
    const candidates = [...text.matchAll(/\b(\d{1,5}[.,]\d{2})\b/g)]
      .map(m => _parseAmount(m[1]))
      .filter(n => n > 0 && n < 100_000);
    if (candidates.length) amount = Math.max(...candidates);
  }

  // ── Titolo (nome negozio dalle prime righe) ──────────
  const titleLine = lines
    .slice(0, 6)
    .find(l =>
      l.length >= 3 &&
      !/^\d/.test(l) &&               // non inizia con cifra
      !/^[*=\-_#]+$/.test(l) &&       // non è una riga di separatori
      !/^(scontrino|ricevuta|data|ora|cassa|pos\b)/i.test(l)
    ) ?? '';

  const title = _cleanTitle(titleLine);

  // ── Categoria ────────────────────────────────────────
  const category = _guessCategory(text);

  return { amount, title, category, raw: text };
}
