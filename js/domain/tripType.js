/* =====================================================
   CAMBUSA — domain/tripType.js
   Tipi di evento supportati da Cambusa.

   Aggiungere un nuovo tipo qui è sufficiente:
   il resto dell'app usa tripTypeInfo() e si adatta.

   Il tipo 'custom' sblocca label e icona libere,
   salvate su trip.customLabel / trip.customIcon.
   ===================================================== */

export const TRIP_TYPES = [
  { id: 'viaggio',    label: 'Viaggio',          icon: '✈️'  },
  { id: 'barca',      label: 'Barca',             icon: '⛵'  },
  { id: 'weekend',    label: 'Weekend',           icon: '🏕'  },
  { id: 'festival',   label: 'Festival',          icon: '🎪'  },
  { id: 'sci',        label: 'Vacanza sci',       icon: '🎿'  },
  { id: 'casa',       label: 'Casa condivisa',    icon: '🏠'  },
  { id: 'compleanno', label: 'Compleanno',        icon: '🎂'  },
  { id: 'celibato',   label: 'Addio al celibato', icon: '🎊'  },
  { id: 'nubilato',   label: 'Addio al nubilato', icon: '👰'  },
  { id: 'sport',      label: 'Sport & Avventura', icon: '🏔'  },
  { id: 'cena',       label: 'Cena / Serata',     icon: '🍽'  },
  { id: 'custom',     label: 'Personalizzato',    icon: '✏️'  },
];

/**
 * Restituisce le info del tipo di evento.
 *
 * Accetta:
 *  - una stringa  → id tipo ('viaggio', 'custom', …)
 *  - un oggetto   → trip / draft con .type, .customLabel, .customIcon
 *
 * Per il tipo 'custom' usa customLabel / customIcon dell'oggetto trip.
 *
 * @param {string|object} [tripOrType='viaggio']
 * @returns {{ id: string, label: string, icon: string }}
 */
export function tripTypeInfo(tripOrType = 'viaggio') {
  if (tripOrType && typeof tripOrType === 'object') {
    const trip = tripOrType;
    const type = trip.type ?? 'viaggio';
    if (type === 'custom') {
      return {
        id:    'custom',
        label: trip.customLabel?.trim() || 'Evento',
        icon:  trip.customIcon?.trim()  || '✏️',
      };
    }
    return TRIP_TYPES.find(t => t.id === type) ?? TRIP_TYPES[0];
  }

  // Chiamata con stringa (backward-compat, non conosce customLabel/Icon)
  return TRIP_TYPES.find(t => t.id === tripOrType) ?? TRIP_TYPES[0];
}
