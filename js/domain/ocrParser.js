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
   5. parseReceiptItems() usa il totale rilevato per
      escludere la riga totale dall'elenco articoli
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

// ── Righe da saltare nel parsing articoli ──────────────
// Più esteso rispetto alla v1: cattura varianti OCR comuni
// (es. T0TALE con zero, "TOTALE  A" con lettera IVA, ecc.)
const SKIP_ITEM_RX = [
  /^\s*$/,
  /^[*=\-_#+|]{2,}/,
  // totale e varianti OCR (T0TALE, T°TALE, TOT, SUBTOT...)
  /\b(t[o0°]tale|t[o0°]tal|tot\.?|sub-?tot|subtotale|sub\s*totale)\b/i,
  // IVA / tasse
  /\b(iva|vat|tax)\s*[\d%]/i,
  /\b(imponibile|imp\.?)\s*[\d]/i,
  // sconti e omaggi
  /\b(sconto|discount|omaggio|abbuono|fidelity|punti|premio)\b/i,
  // metadati scontrino
  /\b(data|ora\b|cassa|pos\b|p\.?\s*iva|c\.?\s*f\.?|cod\.?\s*fisc|scontrino\s*n|ricevuta\s*n)\b/i,
  // pagamento
  /\b(contante|carta|bancomat|paywave|contactless|resto|change|visa|mastercard|amex|pagobancomat)\b/i,
  // saluti / footer
  /\b(grazie|arrivederci|scontrino|ricevuta|fiscale|cortesia|servito)\b/i,
  // numero progressivo scontrino (es. "0001 23/05/2024")
  /^\d{4,}\s+\d{2}[\/\-]\d{2}/,
  // data
  /^\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/,
  // ora
  /^\d{2}:\d{2}/,
  // riga solo cifre/barcode
  /^\d{6,}$/,
];

/** Prezzo a destra riga: ultimo numero decimale della riga */
const PRICE_RIGHT_RX = /(\d{1,5}[.,]\d{2})\s*[A-Z]?\s*$/;

/**
 * Estrae le singole voci (articoli + prezzo) dal testo OCR di uno scontrino.
 *
 * @param {string} text
 * @param {number|null} skipTotalCents — esclude righe il cui importo corrisponde al totale
 * @returns {Array<{id: string, name: string, amountCents: number}>}
 */
export function parseReceiptItems(text, skipTotalCents = null) {
  if (!text) return [];

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    // Salta righe irrilevanti
    if (SKIP_ITEM_RX.some(rx => rx.test(line))) continue;

    // Cerca prezzo a destra
    const match = line.match(PRICE_RIGHT_RX);
    if (!match) continue;

    const amountCents = Math.round(_parseAmount(match[1]) * 100);
    if (amountCents <= 0 || amountCents > 99900) continue;  // ignora subtotali grandi

    // Salta se l'importo corrisponde al totale rilevato (riga totale non filtrata dal regex)
    if (skipTotalCents !== null && Math.abs(amountCents - skipTotalCents) <= 2) continue;

    // Nome = tutto prima del prezzo, ripulito
    const rawName = line.slice(0, match.index)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sàèéìòùÀÈÉÌÒÙ°'".,&\-()/]/g, '')
      .trim()
      .slice(0, 50);

    if (rawName.length < 2) continue;

    items.push({
      id:          crypto.randomUUID(),
      name:        rawName,
      amountCents,
    });
  }

  return items;
}

// ── Export ─────────────────────────────────────────────

/**
 * Analizza il testo OCR di uno scontrino.
 *
 * @param {string} text
 * @returns {{ amount: number|null, totalCents: number|null, title: string, category: string, raw: string }}
 */
export function parseReceipt(text) {
  if (!text) return { amount: null, totalCents: null, title: '', category: 'altro', raw: '' };

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

  const totalCents = amount !== null ? Math.round(amount * 100) : null;

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

  return { amount, totalCents, title, category, raw: text };
}
