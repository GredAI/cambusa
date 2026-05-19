/* =====================================================
   CAMBUSA — domain/tripType.js
   Tipi di evento supportati da Cambusa.

   Aggiungere un nuovo tipo qui è sufficiente:
   il resto dell'app usa tripTypeInfo() e si adatta.
   ===================================================== */

export const TRIP_TYPES = [
  { id: 'viaggio',  label: 'Viaggio',          icon: '✈️'  },
  { id: 'barca',    label: 'Barca',             icon: '⛵'  },
  { id: 'weekend',  label: 'Weekend',           icon: '🏕'  },
  { id: 'festival', label: 'Festival',          icon: '🎪'  },
  { id: 'casa',     label: 'Casa condivisa',    icon: '🏠'  },
  { id: 'sci',      label: 'Vacanza sci',       icon: '🎿'  },
  { id: 'celibato', label: 'Addio al celibato', icon: '🎊'  },
  { id: 'altro',    label: 'Evento',            icon: '📋'  },
];

/**
 * Restituisce le info del tipo di evento dato l'id.
 * Fallback: il primo tipo ('viaggio') se id non riconosciuto.
 *
 * @param {string} [type='viaggio']
 * @returns {{ id: string, label: string, icon: string }}
 */
export function tripTypeInfo(type = 'viaggio') {
  return TRIP_TYPES.find(t => t.id === type) ?? TRIP_TYPES[0];
}
