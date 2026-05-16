/* =====================================================
   CAMBUSA — indexedDb.js
   Wrapper promise-based su IndexedDB.

   SCHEMA V2
   ─────────────────────────────────────────────────────
   trips        → aggregate root (participants + groups nested)
   expenses     → store separato, index su tripId
   expenseItems → placeholder OCR (Fase 5), index su expenseId
   attachments  → blob ricevute, index su expenseId
   settlements  → pagamenti confermati (non derived state), index su tripId
   settings     → record singolo { id: 'default' }

   CONVENZIONI
   ─────────────────────────────────────────────────────
   • Non si salvano derived state (balances, totali, isPartial…)
   • participant.startDate/endDate === null → eredita dal viaggio
   • IDs generati con crypto.randomUUID()
   ===================================================== */

const DB_NAME    = 'cambusa-db';
const DB_VERSION = 2;

let _db = null;

// ── Open / upgrade ────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db     = e.target.result;
      const oldVer = e.oldVersion;

      // trips — participants e groups restano nested (aggregate root)
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }

      // expenses — entità di primo livello, index su tripId
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('tripId', 'tripId', { unique: false });
      }

      // expenseItems — voci singole (OCR supermercato, Fase 5)
      if (!db.objectStoreNames.contains('expenseItems')) {
        const s = db.createObjectStore('expenseItems', { keyPath: 'id' });
        s.createIndex('expenseId', 'expenseId', { unique: false });
      }

      // attachments — blob fuori dall'oggetto expense
      if (!db.objectStoreNames.contains('attachments')) {
        const s = db.createObjectStore('attachments', { keyPath: 'id' });
        s.createIndex('expenseId', 'expenseId', { unique: false });
      }

      // settlements — pagamenti reali già avvenuti (non i saldi calcolati)
      if (!db.objectStoreNames.contains('settlements')) {
        const s = db.createObjectStore('settlements', { keyPath: 'id' });
        s.createIndex('tripId', 'tripId', { unique: false });
      }

      // settings — record singolo, sempre id: 'default'
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      if (oldVer === 1) {
        // Migrazione v1 → v2: le spese erano nested in trips.expenses[].
        // La migrazione dei dati avviene in Actions.init() dopo l'apertura del DB.
        console.log('[DB] Upgrade v1→v2: migrazione spese delegata ad Actions.init()');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      console.log(`[DB] IndexedDB pronto — schema v${DB_VERSION}`);
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Helper generici (interni) ─────────────────────────

function _get(store, id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store)
                  .get(id);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function _getAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store)
                  .getAll();
    req.onsuccess = (e) => resolve(e.target.result ?? []);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function _getByIndex(store, indexName, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly')
                  .objectStore(store)
                  .index(indexName)
                  .getAll(value);
    req.onsuccess = (e) => resolve(e.target.result ?? []);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function _put(store, record) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    // Error sull'IDBRequest stesso (es: constraint violation)
    req.onerror = (e) => {
      console.error(`[DB] Errore scrittura su "${store}":`, e.target.error, record);
      reject(e.target.error);
    };
    tx.oncomplete = () => resolve(record);
    tx.onerror    = (e) => {
      console.error(`[DB] Transazione fallita su "${store}":`, e.target.error);
      reject(e.target.error);
    };
    tx.onabort = (e) => {
      console.error(`[DB] Transazione abortita su "${store}":`, e.target.error);
      reject(e.target.error ?? new Error('Transaction aborted'));
    };
  }));
}

function _delete(store, id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  }));
}

// ── API pubblica ──────────────────────────────────────
export const DB = {

  /** Apre la connessione al DB (chiamare una volta all'avvio) */
  init: () => openDB(),

  // ── Trips ───────────────────────────────────────────
  trips: {
    get:    (id)   => _get('trips', id),
    getAll: ()     => _getAll('trips'),
    save:   (trip) => _put('trips', trip),
    delete: (id)   => _delete('trips', id),
  },

  // ── Expenses ────────────────────────────────────────
  expenses: {
    get:       (id)     => _get('expenses', id),
    getAll:    ()       => _getAll('expenses'),
    getByTrip: (tripId) => _getByIndex('expenses', 'tripId', tripId),
    save:      (exp)    => _put('expenses', exp),
    delete:    (id)     => _delete('expenses', id),
  },

  // ── ExpenseItems (Fase 5 — OCR) ─────────────────────
  expenseItems: {
    getByExpense: (expenseId) => _getByIndex('expenseItems', 'expenseId', expenseId),
    save:         (item)      => _put('expenseItems', item),
    delete:       (id)        => _delete('expenseItems', id),
  },

  // ── Attachments ─────────────────────────────────────
  attachments: {
    getByExpense: (expenseId) => _getByIndex('attachments', 'expenseId', expenseId),
    save:         (att)       => _put('attachments', att),
    delete:       (id)        => _delete('attachments', id),
  },

  // ── Settlements ─────────────────────────────────────
  // Solo pagamenti già avvenuti — i saldi si calcolano runtime
  settlements: {
    get:       (id)     => _get('settlements', id),
    getAll:    ()       => _getAll('settlements'),
    getByTrip: (tripId) => _getByIndex('settlements', 'tripId', tripId),
    save:      (s)      => _put('settlements', s),
    delete:    (id)     => _delete('settlements', id),
  },

  // ── Settings ────────────────────────────────────────
  // Record singolo — sempre letto/scritto come { id: 'default', ...prefs }
  settings: {
    get:  ()      => _get('settings', 'default'),
    save: (prefs) => _put('settings', { id: 'default', ...prefs }),
  },
};
