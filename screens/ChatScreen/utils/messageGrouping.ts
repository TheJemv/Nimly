// Message grouping and time separators for chat (iMessage / Instagram style).
//
// The message list arrives ordered from newest (index 0) to oldest,
// because the FlatList renders `inverted`.

const GROUP_WINDOW_MS = 5 * 60 * 1000; // consecutive bubbles from the same author merge if they're <5 min apart
const SEPARATOR_GAP_MS = 60 * 60 * 1000; // 1h+ gap => a date/time separator is shown

export type GroupPosition = "single" | "first" | "middle" | "last";

const R = 20; // rounded outer corner
const r = 6; // inner corner (touching another bubble in the same group)

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

// Manual formatting: Hermes on iOS doesn't always include `Intl`, so
// `toLocaleTimeString`/`toLocaleDateString` with options can return an
// unexpected format. With these tables the result is identical everywhere.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
   "Jan", "Feb", "Mar", "Apr", "May", "Jun",
   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Time in 12h format: "9:41 PM" */
const clockTime = (d: Date) => {
   let h = d.getHours();
   const m = d.getMinutes();
   const ampm = h >= 12 ? "PM" : "AM";
   h = h % 12;
   if (h === 0) h = 12;
   return `${h}:${m < 10 ? "0" + m : m} ${ampm}`;
};

/** Short time for a bubble: "9:41 PM" */
export const formatBubbleTime = (dateString?: string) => {
   const d = dateString ? new Date(dateString) : null;
   if (!d || isNaN(d.getTime())) return "";
   return clockTime(d);
};

/** Discreet label for the chat's central separator. */
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

/** Corner radii based on position within the group and the author's side. */
export const cornerRadius = (mine: boolean, pos: GroupPosition) => {
   if (pos === "single") {
      return {
         borderTopLeftRadius: R,
         borderTopRightRadius: R,
         borderBottomLeftRadius: R,
         borderBottomRightRadius: R,
      };
   }

   // Author's side: right for me, left for the other person.
   // The opposite side is always fully rounded.
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
   /** bottom margin toward the newest message (group gap). */
   __spacing: number;
}

/**
 * Adds grouping metadata to each message.
 * @param messages list ordered from newest (0) to oldest.
 * @param hasMore  whether there's still unloaded history (so we don't render a
 *                 "start of conversation" separator that later disappears).
 */
export function decorateMessages(messages: any[], hasMore: boolean): DecoratedMessage[] {
   return messages.map((m, i) => {
      const older = messages[i + 1]; // chronologically earlier
      const newer = messages[i - 1]; // chronologically later

      const t = toTime(m.created_at);
      const olderT = older ? toTime(older.created_at) : null;
      const newerT = newer ? toTime(newer.created_at) : null;

      // Separator between `older` and `m`? The label shows the time of `m`
      // (the message that comes after the gap).
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

      // Does the newest message start a new group?
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
