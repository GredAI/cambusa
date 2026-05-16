# Cambusa — Domain Invariants

Contratti immutabili del dominio. Non sono documentazione opzionale:
qualsiasi codice che li viola introduce un bug.

---

## Amounts

- Tutti gli importi sono **integer cents** (centesimi interi).
- `amountCents` è il campo canonico (v4+). `amount` esiste per compatibilità legacy (v3) e viene scritto in dual-write finché non viene rimosso.
- `Guards.readAmount(record)` è l'unico punto di lettura: legge `amountCents` se integer, altrimenti fallback su `amount`. Nessun altro codice accede direttamente a questi campi.
- `_toCents(v)` in `actions.js` è l'unico punto di conversione UI→DB. Non esiste conversione altrove.
- `formatCurrency(cents)` in `selectors.js` è l'unico punto di conversione DB→UI (divide per 100).
- I balance in `state.js` sono in centesimi interi. `suggestedSettlements` restituisce importi in centesimi interi.

## Expenses

- Una spesa è **attiva** se `deletedAt === null` e `personal === false`. Solo le spese attive entrano nel calcolo dei saldi.
- Una spesa è **personale** se `personal === true`. È esclusa dai saldi di gruppo ma tracciata separatamente.
- Una spesa è **eliminata** se `deletedAt` è una stringa ISO (soft delete). Non viene mai rimossa fisicamente dal DB.
- `Guards.isGroupExpense(e)` — predicato canonico per "entra nei saldi".
- `Guards.isPersonalExpense(e)` — predicato canonico per "è una spesa personale attiva".
- `Guards.isDeletedExpense(e)` — predicato canonico per soft delete.
- Nessun selector filtra con `!e.personal` direttamente — usa sempre i Guards.

## Participants

- `shares` è sempre un integer ≥ 0. `shares === 0` significa ospite (non paga).
- `delegatedTo` è `null` oppure l'UUID di un altro partecipante che copre la sua quota.
- `Guards.readShares(p)` fallback a 1 se il campo non è un integer valido.
- La delegazione è risolta a un solo livello (A→B). Catene A→B→C non sono supportate.

## Balances

- I balance non vengono mai persistiti. Sono sempre derivati da expenses + settlements in memoria.
- `State.balances()` è la funzione canonica. Nessun altro codice calcola i saldi.
- Il balance di un partecipante con `deletedAt` o `personal` sulle sue spese non è alterato da quelle spese.
- I settlement confermati (`confirmed: true`) riducono i balance. I settlement non confermati non esistono nel modello.

## Settlements

- Un settlement rappresenta un pagamento **già avvenuto**, non una proposta.
- `suggestedSettlements()` restituisce proposte: non vengono persistite finché l'utente non conferma.
- `amountCents` è il campo canonico. `amount` esiste in dual-write per compat legacy.

## Naming (congelato — non modificare)

| Campo         | Tipo            | Note                          |
|---------------|-----------------|-------------------------------|
| `amountCents` | integer         | importo in cents (v4+)        |
| `amount`      | integer (legacy)| dual-write compat, futuro: rimosso |
| `deletedAt`   | ISO string\|null | null = attivo                 |
| `createdAt`   | ISO string      |                               |
| `updatedAt`   | ISO string      |                               |
| `personal`    | boolean         | false = di gruppo             |
| `ownerId`     | UUID\|null      | solo per spese personal       |
| `delegatedTo` | UUID\|null      | null = nessuna delega         |

## Data flow (unico percorso autorizzato)

```
UI input
↓ _toCents() — actions.js
Actions (write integrity)
↓ DB.expenses.save()
IndexedDB
↓ State.expenses (cache)
Guards (read safety — readAmount, isGroupExpense, …)
↓
Selectors (pure derivation — nessuna mutazione, nessun repair)
↓ formatCurrency()
UI display
```

Nessun layer salta un altro layer. Nessun layer muta dati di un altro layer.

## Regole di migrazione

- Le migrazioni sono **idempotenti**: controllano sempre `if (campo non esiste)` prima di scrivere.
- `schemaVersion` in `settings` traccia la versione del formato dati (attualmente 4).
- `DB_VERSION` in `indexedDb.js` traccia la struttura dell'IndexedDB (stores/indexes). Sono due version track separati.
- Non si rimuovono campi legacy finché tutti i client non hanno eseguito la migrazione che aggiunge il sostituto.
