/* =====================================================
   CAMBUSA — domain/result.js
   Tipo Result discriminato: Ok | Err.

   PRINCIPIO
   ─────────────────────────────────────────────────────
   Le Actions non lanciano MAI eccezioni per errori di
   dominio. Restituiscono sempre un Result che la UI
   può ispezionare, mostrare e aggregare.

   UTILIZZO
   ─────────────────────────────────────────────────────
   const result = await Actions.createExpense(tripId, input);
   if (!result.ok) {
     Toast.show(result.errors[0]);
     return;
   }
   doSomethingWith(result.value);
   ===================================================== */

/**
 * Result positivo — operazione riuscita.
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T, errors: [] }}
 */
export function Ok(value) {
  return Object.freeze({ ok: true, value, errors: [] });
}

/**
 * Result negativo — operazione fallita.
 * @param {string|string[]} errors  — codici errore da E.* o G.*
 * @returns {{ ok: false, value: null, errors: string[] }}
 */
export function Err(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  return Object.freeze({ ok: false, value: null, errors: list });
}

/** Type guard — true se il Result è Ok */
export const isOk  = r => r?.ok === true;

/** Type guard — true se il Result è Err */
export const isErr = r => r?.ok === false;
