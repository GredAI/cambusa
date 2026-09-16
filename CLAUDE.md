# Cambusa — Guida per Claude

Leggi questo file all'inizio di ogni sessione. Contiene tutto il necessario per
continuare lo sviluppo senza dover riscoprire l'architettura.

---

## Cos'è Cambusa

PWA mobile-first per la gestione delle spese condivise nei viaggi.
Vanilla JS ES modules, nessun framework, nessun bundler.
Dati salvati localmente in **IndexedDB**. Nessun backend, nessun account.
Distribuita su **GitHub Pages** (`https://gredai.github.io/cambusa/`).
Repository: `git@github.com:GredAI/cambusa.git`

**Versione corrente: v120**

---

## Stack tecnico

| Layer | Tecnologia |
|---|---|
| UI | Vanilla JS ES modules + HTML template literals |
| Storage | IndexedDB (wrapper in `js/indexedDb.js`) |
| State | Singleton `js/state.js` — mai mutato direttamente, solo via `Actions` |
| Routing | SPA hash-based in `js/router.js` |
| OCR | Tesseract.js (CDN) in `js/ocr.js` |
| Service Worker | `sw.js` — network-first JS/CSS/HTML, cache-first immagini |
| Deploy | GitHub Pages; aggiornare `CACHE_NAME` in `sw.js` ad ogni release |

---

## Regole fondamentali

1. **Tutti gli importi sono in centesimi interi** (`amountCents`). Mai usare decimali nel DB.
   - Conversione UI→DB: `_toCents()` in `actions.js`
   - Conversione DB→UI: `Selectors.formatCurrency(cents)`
   - Lettura sicura: `Guards.readAmount(expense)` (gestisce legacy `amount`)

2. **Soft delete**: le spese non vengono mai cancellate fisicamente. `deletedAt: null` = attiva.

3. **Guard critica — non rimuovere mai**:
   ```js
   if (!Guards.isGroupExpense(e)) continue;
   ```
   In `state.js` nelle funzioni `balances()` e `giftSummary()`. Senza di essa le spese
   cancellate e personali inquinano i saldi.

4. **State è read-only dall'esterno**. Scritture solo via `Actions.*`. I selectors sono
   derivazioni pure, non mutano mai nulla.

5. **`tripTypeInfo(tripOrId)`** accetta sia la stringa ID che l'oggetto trip completo.
   Per il tipo `'custom'` serve l'oggetto per leggere `trip.customLabel` / `trip.customIcon`.

6. **Categorie**: le 8 categorie (`alloggio`, `trasporti`, `noleggi`, `cibo`, `spesa`,
   `attivita`, `servizi`, `altro`) hanno icone SVG in `js/components/catIcon.js`.
   Usare sempre `catIcon(id, size)` e `CAT_LABEL[id]` — mai emoji né `cfg.icon`.

7. **Service Worker**: ogni release deve fare il bump di `CACHE_NAME` in `sw.js` e
   aggiornare la query string `?v=NNN` in `index.html` e `APP_VERSION` in `settings.js`.

---

## Struttura file

```
cambusa/
├── index.html                  ← entry point, ?v=120
├── sw.js                       ← service worker, cambusa-v120
├── manifest.json
├── css/
│   └── app.css                 ← unico foglio di stile
├── js/
│   ├── app.js                  ← bootstrap, registra SW, router, auto-backup
│   ├── router.js               ← SPA routing
│   ├── state.js                ← singleton state + engine saldi
│   ├── actions.js              ← CRUD + business logic
│   ├── selectors.js            ← derivazioni pure (categoryTotals, groupedExpenses…)
│   ├── indexedDb.js            ← wrapper IndexedDB
│   ├── autoBackup.js           ← backup giornaliero in localStorage
│   ├── ocr.js                  ← wrapper Tesseract.js
│   ├── toast.js                ← sistema notifiche
│   ├── ui.js                   ← Topbar, BottomNav, applyTheme
│   ├── domain/
│   │   ├── guards.js           ← isGroupExpense, readAmount, readPayers…
│   │   ├── normalize.js        ← conversione input → entità
│   │   ├── tripType.js         ← 12 tipi evento + tripTypeInfo()
│   │   ├── recurrence.js       ← pendingTemplates()
│   │   ├── ocrParser.js        ← parseReceipt(), parseReceiptItems()
│   │   ├── result.js           ← Ok/Err types
│   │   └── INVARIANTS.md       ← contratti del dominio
│   ├── components/
│   │   ├── catIcon.js          ← SVG icone categoria + CAT_LABEL
│   │   ├── expenseCard.js      ← card spesa (breakdown + allegato)
│   │   ├── filterChips.js      ← chip filtri categoria
│   │   ├── avatar.js           ← avatar partecipante (img/lettera/blank)
│   │   └── dateGroup.js        ← header gruppo data
│   ├── screens/
│   │   ├── home.js
│   │   ├── trip.js             ← schermata viaggio (saldi, categorie, recenti)
│   │   ├── tripForm.js         ← crea/modifica viaggio (calendario inline, tipi)
│   │   ├── expenses.js         ← lista spese (filtri, ricerca, viewer allegati)
│   │   ├── newExpense.js       ← form nuova/modifica spesa
│   │   ├── balances.js         ← saldi e settlements
│   │   ├── charts.js           ← grafici spese
│   │   ├── receiptScanner.js   ← OCR scontrino → spesa + allegato
│   │   ├── recurringManager.js ← spese ricorrenti
│   │   └── settings.js         ← impostazioni, backup, versione
│   └── ui/
│       └── modal.js            ← Modal.confirm()
├── assets/
│   ├── avatars/                ← av00.png … av46.png (47 avatar)
│   ├── apple-touch-icon.png
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    ├── ROADMAP.md              ← backlog e changelog
    └── INVARIANTS.md           ← (copia in js/domain/)
```

---

## IndexedDB — stores

| Store | keyPath | Indici |
|---|---|---|
| `trips` | `id` | — |
| `expenses` | `id` | `tripId` |
| `attachments` | `id` | `expenseId` |
| `settlements` | `id` | `tripId` |
| `settings` | `id` | — (record unico `id: 'default'`) |

**Allegati**: `{ id, expenseId, blob, mimeType, createdAt }`.
Non vengono esportati nel backup JSON (troppo pesanti).
L'expense ha `attachmentIds: string[]` per sapere se esistono allegati senza caricare i blob.

---

## Modello dati — Expense

```js
{
  id:           UUID,
  tripId:       UUID,
  title:        string,
  category:     'alloggio'|'trasporti'|'noleggi'|'cibo'|'spesa'|'attivita'|'servizi'|'altro',
  amountCents:  integer,          // importo in centesimi
  currency:     string,           // es. '€'
  date:         'YYYY-MM-DD',
  notes:        string,
  personal:     boolean,          // true = spesa personale, esclusa dai saldi
  ownerId:      UUID|null,        // solo se personal: true
  consumers:    [{ participantId, shares }],
  payers:       [{ participantId, sharesPaid }],
  splitMeta:    {
    consumerMode: 'equal'|'shares'|'amounts'|'percent'|'days',
    guests:       [...],          // ospiti non partecipanti
    receiptItems: [...],          // voci OCR
  },
  attachmentIds: UUID[],          // collegamento ai blob in store 'attachments'
  deletedAt:    ISO|null,         // null = attiva; soft delete
  createdAt:    ISO,
  updatedAt:    ISO,
}
```

---

## Modello dati — Trip

```js
{
  id:              UUID,
  name:            string,
  location:        string,
  startDate:       'YYYY-MM-DD',
  endDate:         'YYYY-MM-DD',
  currency:        string,
  type:            'viaggio'|'barca'|'weekend'|'festival'|'sci'|'casa'|
                   'compleanno'|'celibato'|'nubilato'|'sport'|'cena'|'custom',
  customLabel:     string,        // solo se type === 'custom'
  customIcon:      string,        // emoji, solo se type === 'custom'
  participants:    [{ id, name, color, avatarIndex, avatarBlank, startDate, endDate }],
  groups:          [{ id, name, members: UUID[] }],
  splitPresets:    [{ id, name, participantIds: UUID[] }],
  recurringTemplates: [...],
  archivedAt:      ISO|null,
}
```

---

## Pattern di sviluppo

### Aggiungere una nuova schermata
1. Creare `js/screens/nomeSchermata.js` con `export const NomeScreen = { html(), mount(), unmount() }`
2. Registrarla in `js/router.js`
3. Importarla in `js/app.js`

### Aggiungere un'azione
1. Aggiungere metodo `async nomeAzione(...)` in `Actions` in `js/actions.js`
2. Restituire sempre `Ok(value)` o `Err([...messages])` da `js/domain/result.js`
3. Aggiornare `State.*` in memoria dopo la scrittura su DB

### Bump versione (ogni release)
```js
// sw.js
const CACHE_NAME = 'cambusa-vNNN';
// index.html
<link rel="stylesheet" href="css/app.css?v=NNN" />
<script type="module" src="js/app.js?v=NNN"></script>
// js/screens/settings.js
const APP_VERSION = 'vNNN';
```

### Deploy
```bash
cd ~/Documents/Cambusa
git add -A
git commit -m "feat/fix: descrizione (vNNN)"
git push
```
GitHub Pages si aggiorna in ~1 minuto. Su iOS: chiudi l'app dal multitasking, riapri.

---

## Backlog attuale

| # | Feature | Priorità | Note |
|---|---|---|---|
| #33 | Più valute (30+) | Media | Espandere `CURRENCIES` in settings.js e tripForm.js |
| #38 | Conversione valuta | Bassa | `api.frankfurter.app`, dipende da #33 |

Tutto il resto (grafici, ricerca, ricorrenti, divisioni, backup, calendario, OCR, allegati) è **già implementato**.

---

## Gotcha e trappole note

- **`catIcon()` usa `currentColor`**: il colore dell'icona dipende dal CSS del contenitore. Aggiungere `color: var(--color-text-muted)` se l'icona appare nera.
- **`CAT_CONFIG` non ha più `icon`**: dopo la migrazione SVG, `cfg.icon` è `undefined`. Usare sempre `catIcon()` + `CAT_LABEL`.
- **Calendar `_calPicking`**: lo stato inizia e torna sempre a `'start'`. La modalità `'end'` si attiva solo esplicitamente con "+ Aggiungi data di fine".
- **`tripTypeInfo()`**: passare l'oggetto trip completo (non solo `trip.type`) quando il tipo può essere `'custom'`.
- **Allegati non esportati**: i blob in `attachments` non finiscono nel backup JSON. Documentato e intenzionale.
- **iOS Service Worker**: su PWA installata dalla Home, il SW si aggiorna solo dopo aver chiuso e riaperto l'app. Safari (non dalla Home) è più reattivo.
