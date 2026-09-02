// Agrupación y separadores de tiempo para el chat (estilo iMessage / Instagram).
//
// La lista de mensajes llega ordenada del más nuevo (índice 0) al más viejo,
// porque el FlatList se renderiza `inverted`.

const GROUP_WINDOW_MS = 5 * 60 * 1000; // burbujas consecutivas del mismo autor se fusionan si están a <5 min
const SEPARATOR_GAP_MS = 60 * 60 * 1000; // 1h+ de diferencia => se muestra un separador de hora/fecha

export type GroupPosition = "single" | "first" | "middle" | "last";

const R = 20; // esquina exterior redondeada
const r = 6; // esquina interior (pegada a otra burbuja del mismo grupo)

const toTime = (v: string | number | Date) =>
   v instanceof Date ? v.getTime() : new Date(v).getTime();

const isSameDay = (a: string | number | Date, b: string | number | Date) => {
   const da = new Date(a);
   const db = new Date(b);
   return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
   );
};

// Formateo manual: Hermes en iOS no siempre incluye `Intl`, así que
// `toLocaleTimeString`/`toLocaleDateString` con opciones puede devolver un
// formato inesperado. Con estas tablas el resultado es idéntico en todos lados.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
   "Jan", "Feb", "Mar", "Apr", "May", "Jun",
   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Hora en formato 12h: "9:41 PM" */
const clockTime = (d: Date) => {
   let h = d.getHours();
   const m = d.getMinutes();
   const ampm = h >= 12 ? "PM" : "AM";
   h = h % 12;
   if (h === 0) h = 12;
   return `${h}:${m < 10 ? "0" + m : m} ${ampm}`;
};

/** Hora corta de una burbuja: "9:41 PM" */
export const formatBubbleTime = (dateString?: string) => {
   const d = dateString ? new Date(dateString) : null;
   if (!d || isNaN(d.getTime())) return "";
   return clockTime(d);
};

/** Etiqueta discreta del separador central del chat. */
export const formatSeparator = (dateString: string) => {
   const d = new Date(dateString);
   if (isNaN(d.getTime())) return "";
   const now = new Date();
   const time = clockTime(d);

   if (isSameDay(d, now)) return time;

   const yesterday = new Date(now);
   yesterday.setDate(now.getDate() - 1);
   if (isSameDay(d, yesterday)) return `Yesterday · ${time}`;

   const sameYear = d.getFullYear() === now.getFullYear();
   const datePart = sameYear
      ? `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
      : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
   return `${datePart} · ${time}`;
};

/** Radios de esquina según la posición dentro del grupo y el lado del autor. */
export const cornerRadius = (mine: boolean, pos: GroupPosition) => {
   if (pos === "single") {
      return {
         borderTopLeftRadius: R,
         borderTopRightRadius: R,
         borderBottomLeftRadius: R,
         borderBottomRightRadius: R,
      };
   }

   // Lado del autor: derecha para mí, izquierda para el invitado.
   // El lado contrario siempre va totalmente redondeado.
   if (mine) {
      const top = pos === "first" ? R : r;
      const bottom = pos === "last" ? R : r;
      return {
         borderTopLeftRadius: R,
         borderTopRightRadius: top,
         borderBottomLeftRadius: R,
         borderBottomRightRadius: bottom,
      };
   }

   const top = pos === "first" ? R : r;
   const bottom = pos === "last" ? R : r;
   return {
      borderTopLeftRadius: top,
      borderTopRightRadius: R,
      borderBottomLeftRadius: bottom,
      borderBottomRightRadius: R,
   };
};

export interface DecoratedMessage {
   [key: string]: any;
   __groupPosition: GroupPosition;
   __separatorLabel: string | null;
   /** margen inferior hacia el mensaje más nuevo (gap del grupo). */
   __spacing: number;
}

/**
 * Añade metadatos de agrupación a cada mensaje.
 * @param messages lista ordenada de más nuevo (0) a más viejo.
 * @param hasMore  si aún hay historial sin cargar (para no pintar un separador
 *                 "inicio de la conversación" que luego desaparece).
 */
export function decorateMessages(messages: any[], hasMore: boolean): DecoratedMessage[] {
   return messages.map((m, i) => {
      const older = messages[i + 1]; // cronológicamente anterior
      const newer = messages[i - 1]; // cronológicamente posterior

      const t = toTime(m.created_at);
      const olderT = older ? toTime(older.created_at) : null;
      const newerT = newer ? toTime(newer.created_at) : null;

      // ¿Separador entre `older` y `m`? La etiqueta muestra la hora de `m`
      // (el mensaje que llega después del hueco).
      let separatorLabel: string | null = null;
      if (!older) {
         if (!hasMore) separatorLabel = formatSeparator(m.created_at);
      } else if (
         !isSameDay(olderT!, t) ||
         t - (olderT as number) >= SEPARATOR_GAP_MS
      ) {
         separatorLabel = formatSeparator(m.created_at);
      }

      const brokeFromOlder =
         !older ||
         separatorLabel !== null ||
         older.sender_id !== m.sender_id ||
         t - (olderT as number) >= GROUP_WINDOW_MS;

      // ¿El mensaje más nuevo arranca un grupo nuevo?
      let newerStartsGroup = false;
      if (newer) {
         const newerHasSeparator =
            !isSameDay(t, newerT!) || (newerT as number) - t >= SEPARATOR_GAP_MS;
         newerStartsGroup =
            newerHasSeparator ||
            newer.sender_id !== m.sender_id ||
            (newerT as number) - t >= GROUP_WINDOW_MS;
      }
      const brokeToNewer = !newer || newerStartsGroup;

      let groupPosition: GroupPosition;
      if (brokeFromOlder && brokeToNewer) groupPosition = "single";
      else if (brokeFromOlder) groupPosition = "first";
      else if (!brokeToNewer) groupPosition = "middle";
      else groupPosition = "last";

      return {
         ...m,
         __groupPosition: groupPosition,
         __separatorLabel: separatorLabel,
         __spacing: brokeToNewer ? 14 : 3,
      };
   });
}
