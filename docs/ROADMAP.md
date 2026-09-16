# Cambusa — Roadmap di sviluppo

> Aggiornata a **v119** (settembre 2026)

---

## Changelog recente

| Versione | Feature |
|---|---|
| v91 | Gift/Offerta: ospiti con debito facoltativo + Sdebitarsi |
| v92 | Divisione per % nei consumer |
| v93 | Fix guard `isGroupExpense` in `balances()` e `giftSummary()` |
| v94 | OCR scontrino: schermata dedicata, parsing articoli, assegnazione per partecipante |
| v104 | Palette 12 colori + color picker partecipanti; Home restyling; FAB ring + nav arc |
| v110 | Icone SVG outline per categorie (`catIcon.js`) — rimossi emoji da 5 file |
| v112 | 12 tipi evento + tipo personalizzato con emoji e label liberi |
| v113 | Calendario range-picker inline; fix subtitle data singola |
| v114 | Auto-backup giornaliero — avvio app + download da Impostazioni |
| v115 | Fix UX calendario: un tap = giorno singolo, "+ Aggiungi data di fine" opzionale |
| v116 | Fix "undefined" in Per categoria: `filterChips.js`, `selectors.js`, `trip.js` |
| v117 | Bump version badge a v117; query string index.html aggiornata |
| v118 | Allegati scontrini: salva blob OCR in IndexedDB, icona 🖼 in card, viewer fullscreen |
| v119 | Divisione per giorni (📅 Giorni): nuovo consumerMode 'days', pre-fill da startDate/endDate partecipante |

---

## Backlog — ancora da fare

### `#33` Più valute *(facile, ~30 min)*
Espandere le valute disponibili a 30+.

- `js/screens/settings.js` → array `CURRENCIES` (attualmente 6: € $ £ CHF ¥ kr)
- `js/screens/tripForm.js` → array `CURRENCIES` (attualmente solo 4: € $ £ CHF — da allineare)

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

### `#38` Conversione valuta *(medio, ~2h)*
Mostrare i saldi convertiti in una valuta di riferimento quando le spese hanno valute miste.

- API gratuita: `api.frankfurter.app` (no key richiesta)
- Dipende da: `#33` (più valute)
- Caching dei tassi in `localStorage` (aggiorna max 1×/giorno)

### Idee future (non pianificate)
- **Note sulle spese**: campo testo libero già presente nel modello, UI da costruire
- **Export PDF saldi**: riepilogo stampabile del viaggio
- **Notifiche push**: reminder scadenze spese ricorrenti (richiede permission + SW background)
- **Tema automatico**: seguire le preferenze di sistema (prefers-color-scheme)

---

## Architettura — note chiave

```
balances = f(expenses, settlements)

Expense:
  consumers[]: { participantId, shares }     ← DEBIT
  payers[]:    { participantId, sharesPaid } ← CREDIT
  splitMeta.consumerMode: 'equal' | 'shares' | 'amounts' | 'percent' | 'days'
  splitMeta.guests[]: { guestId, payerIds, gift }
  attachmentIds[]: UUID[] — blob salvati in store 'attachments'

Settlement:
  from → balance +amount (ha pagato il debito)
  to   → balance -amount (ha ricevuto)

Invariante: Σ balances = 0
```

**Guard critica** (non rimuovere mai):
```javascript
if (!isGroupExpense(e)) continue;  // in state.js, balances(), giftSummary()
```
Senza questo guard le spese cancellate (deletedAt != null) e personali (personal: true)
influenzano erroneamente i saldi.

---

## File principali

| File | Responsabilità |
|---|---|
| `js/state.js` | Engine saldi: `balances()`, `suggestedSettlements()`, `giftSummary()` |
| `js/actions.js` | CRUD su IndexedDB + State; include `saveAttachment()` |
| `js/selectors.js` | Derivazioni pure: `categoryTotals()`, `groupedExpenses()`, `formatCurrency()` |
| `js/domain/guards.js` | `isGroupExpense()`, `readAmount()`, `readPayers()`, `readConsumers()` |
| `js/domain/normalize.js` | Conversione input UI → entità dominio |
| `js/domain/tripType.js` | 12 tipi evento + tipo personalizzato; `tripTypeInfo(tripOrId)` |
| `js/domain/recurrence.js` | Spese ricorrenti: `pendingTemplates()` |
| `js/components/catIcon.js` | SVG outline per 8 categorie; `catIcon(id, size)` + `CAT_LABEL` |
| `js/components/expenseCard.js` | Card spesa con breakdown + pulsante allegato |
| `js/components/filterChips.js` | Chip filtri categoria (usa `catIcon` + `CAT_LABEL`) |
| `js/components/avatar.js` | Avatar partecipante; supporta `avatarBlank: true` |
| `js/screens/newExpense.js` | Form spesa completo (consumer modes, guests, gift, OCR shortcut) |
| `js/screens/tripForm.js` | Form crea/modifica viaggio — calendario inline, 12 tipi, splitPresets |
| `js/screens/expenses.js` | Lista spese con filtri, ricerca, totali categoria, viewer allegati |
| `js/screens/balances.js` | Saldi, settlements suggeriti, sezione offerte |
| `js/screens/receiptScanner.js` | OCR scontrino → parsing voci → assegnazione → salva blob |
| `js/screens/recurringManager.js` | Gestione spese ricorrenti |
| `js/screens/charts.js` | Grafici: categorie, persone, andamento giornaliero |
| `js/screens/settings.js` | Impostazioni, backup/restore, versione app |
| `js/autoBackup.js` | Backup giornaliero automatico in localStorage |
| `js/indexedDb.js` | Wrapper IndexedDB: stores trips/expenses/settlements/attachments/settings |
| `sw.js` | Service worker — network-first JS/CSS/HTML, cache-first immagini |
