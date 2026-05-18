# Cambusa — Roadmap di sviluppo

> Aggiornata a **v94** (maggio 2026)

---

## Stato attuale

| Versione | Feature |
|---|---|
| v91 | Gift/Offerta: ospiti con debito facoltativo + Sdebitarsi |
| v92 | Divisione per % nei consumer |
| v93 | Fix: guard `isGroupExpense` in `balances()` Phase 3 e `giftSummary()` |
| v94 | **OCR scontrino**: schermata dedicata, parsing articoli, assegnazione per partecipante |

---

## Prossima sessione — Priorità

### 1. Fix app bianca (urgente, ~15 min)
Risolvere il problema del service worker che serve file vecchi dalla cache.
- Verificare che il push GitHub Pages sia arrivato dopo v94
- Se necessario, forzare SW update con `skipWaiting` dalla console

### 2. `#33` Più valute (facile, ~30 min)
Espandere le 6 valute attuali a 30+ nelle impostazioni.

**File**: `js/screens/settings.js` → array `CURRENCIES`  
**File**: `js/screens/tripForm.js` → stesso array nel form viaggio

Valute target:
```
€ $ £ CHF ¥ kr
AUD CAD HKD SGD NZD
NOK SEK DKK
PLN CZK HUF RON
TRY AED SAR ILS
MXN BRL ARS CLP COP
THB INR IDR MYR PHP VND
```

### 3. `#34` Grafici spese (medio, ~1h)
Bar chart spese per giorno nella schermata trip o expenses.

**Libreria**: Chart.js (già disponibile come CDN)  
**File nuovo**: `js/components/spendingChart.js`  
**Dati**: `Selectors.expensesByDate()` → `{ date, totalCents }`  
**Posizione UI**: sezione collassabile in `trip.js` dopo le statistiche per categoria

### 4. `#35` Ricerca spese (facile, ~30 min)
Campo di ricerca testuale nella schermata expenses.

**File**: `js/screens/expenses.js`  
**Pattern**: input con `data-search`, filtro in `_renderList()` su `title + category + notes`  
**UI**: barra di ricerca sotto i filtri categoria, visibile solo se ci sono > 5 spese

---

## Backlog (sessioni successive)

### `#36` Salva divisioni predefinite (~1h)
Permettere di salvare gruppi di consumer riutilizzabili (es. "Solo i grandi", "Solo noi due").

**Idea**: `settings.savedSplits: [{ name, participantIds }]`  
Selezionabili come preset nel form nuova spesa.

### `#37` Spese ricorrenti (~2h)
Segnare una spesa come "ricorrente" per creare rapidamente copie.

**UI**: bottone "Duplica" su ogni expense card  
**Extra**: opzione "ogni N giorni" con creazione automatica

### `#38` Conversione valuta (~2h)
Mostrare i saldi convertiti in una valuta di riferimento quando le spese hanno valute miste.

**API gratuita**: `api.frankfurter.app` (no key richiesta)  
**Dipende da**: `#33` (più valute deve essere già fatto)

---

## Architettura — note chiave

```
balances = f(expenses, settlements)

Expense:
  consumers[]: { participantId, shares }   ← DEBIT
  payers[]:    { participantId, sharesPaid } ← CREDIT
  splitMeta.consumerMode: 'equal' | 'shares' | 'amounts' | 'percent'
  splitMeta.guests[]: { guestId, payerIds, gift }

Settlement:
  from → balance +amount (ha pagato il debito)
  to   → balance -amount (ha ricevuto)

Invariante: Σ balances = 0
```

**Guard critica** (non rimuovere):
```javascript
if (!isGroupExpense(e)) continue;  // Phase 1/3 in state.js
```
Senza questo guard le spese cancellate con `splitMeta.guests` continuano
a influenzare i saldi/settlements.

---

## File principali

| File | Responsabilità |
|---|---|
| `js/state.js` | Engine saldi: `balances()`, `suggestedSettlements()`, `giftSummary()` |
| `js/actions.js` | CRUD su IndexedDB + State |
| `js/domain/guards.js` | `isGroupExpense()`, `readAmount()`, ecc. |
| `js/domain/normalize.js` | Conversione input → entità dominio |
| `js/screens/newExpense.js` | Form spesa (consumer modes, guests, gift) |
| `js/screens/balances.js` | Saldi, settlements suggeriti, sezione offerte |
| `js/screens/receiptScanner.js` | OCR scontrino (nuovo in v94) |
| `js/domain/ocrParser.js` | `parseReceipt()` + `parseReceiptItems()` |
| `sw.js` | Service worker — bump `CACHE_NAME` ad ogni release |
