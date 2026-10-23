/**
 * The daily shelf: a shelf of one size, filled with books each day, the same
 * for everyone that day. The books are dealt from a shuffled deck, as many as
 * fit side by side, so a day of wide books has fewer than a day of narrow
 * ones. No book comes back until every other one has had its turn, then the
 * deck is shuffled again. Everything follows from the date, so the site stays
 * static. (Adding a book reshuffles the deck, so earlier days can change
 * after the catalog does.)
 *
 * Widths are measured in book heights: a cover's width is its ratio, the
 * day's book stands FEATURED_SCALE times taller, and the shelf (see
 * src/pages/daily.astro) is SHELF_WIDTH wide with GAP between books.
 */

/** The room on the shelf for books and the gaps between them. */
export const SHELF_WIDTH = 5.2;
export const GAP = 0.1;
export const FEATURED_SCALE = 1.24;
/** How far down the deck to look for a book that fits the space left. */
const LOOKAHEAD = 4;
/** Whose "today" the shelf follows, so visitors anywhere see the same one. */
export const SHELF_TIME_ZONE = "America/New_York";
/** The first shelf; the page goes back no further. */
export const FIRST_DAY = "2026-10-01";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** "2026-10-22" → days since 1970-01-01; NaN for anything else. */
export function dayNumber(date: string): number {
  const m = DATE.exec(date);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Rejects dates that don't exist, like 2026-02-30.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return t / DAY_MS;
}

/** Days since 1970-01-01 → "2026-10-22". */
export function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in `timeZone`, as "2026-10-22". */
export function todayIn(timeZone = SHELF_TIME_ZONE, now = new Date()): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A small seeded random number generator (mulberry32): the same seed, the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deck `round`: every item once, in an order fixed by the round. */
function deck<T>(items: readonly T[], round: number): T[] {
  const random = seeded(round * 2654435761 + 1);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How many years ago `acquired` was, if `date` is its anniversary; only for
 * full dates, and not on the day itself. A book bought on February 29 has
 * its anniversary on February 28 in other years.
 */
export function yearsSince(
  acquired: string | undefined,
  date: string,
): number | undefined {
  const a = acquired ? DATE.exec(acquired) : null;
  const d = DATE.exec(date);
  if (!a || !d || Number.isNaN(dayNumber(acquired!))) return undefined;
  const years = Number(d[1]) - Number(a[1]);
  if (years <= 0) return undefined;
  let monthDay = `${a[2]}-${a[3]}`;
  if (monthDay === "02-29" && Number.isNaN(dayNumber(`${d[1]}-02-29`)))
    monthDay = "02-28";
  return monthDay === `${d[2]}-${d[3]}` ? years : undefined;
}

export interface DailyBook {
  slug: string;
  /** The cover's width over its height. */
  ratio: number;
  acquired?: string;
}

export interface DailyShelf {
  /** Left to right, with the featured book in the middle. */
  slugs: string[];
  featured: string;
  /** Set when the featured book joined the collection on this day, years ago. */
  anniversary?: number;
}

/**
 * The book that joined the collection on `date` in an earlier year (the
 * longest-held one, if there are a few), and how many years ago.
 */
function anniversaryOn(books: readonly DailyBook[], date: string) {
  return books
    .map((book) => ({ book, years: yearsSince(book.acquired, date) }))
    .filter(
      (a): a is { book: DailyBook; years: number } => a.years !== undefined,
    )
    .sort(
      (a, b) => b.years - a.years || a.book.slug.localeCompare(b.book.slug),
    )[0];
}

/**
 * The shelf for `date`. Each day since FIRST_DAY takes books from the front
 * of the deck: the first is the day's book (unless a book has its
 * anniversary that day, which then is), then more while they fit. A book too
 * wide for the space left waits at the front for the next day, while the
 * next few are tried. Days before FIRST_DAY get no shelf.
 */
export function dailyShelf(
  books: readonly DailyBook[],
  date: string,
): DailyShelf | undefined {
  const first = dayNumber(FIRST_DAY);
  const last = dayNumber(date);
  if (books.length === 0 || Number.isNaN(last) || last < first)
    return undefined;
  const sorted = [...books].sort((a, b) => a.slug.localeCompare(b.slug));
  const queue: DailyBook[] = [];
  let round = 0;
  const fill = () => {
    while (queue.length < LOOKAHEAD + 2) queue.push(...deck(sorted, round++));
  };

  let shelf: DailyShelf | undefined;
  for (let day = first; day <= last; day++) {
    const today = dateOf(day);
    fill();
    const special = anniversaryOn(sorted, today);
    const featured = special?.book ?? queue.shift()!;
    const chosen: DailyBook[] = [];
    let used = featured.ratio * FEATURED_SCALE;
    let misses = 0;
    for (let i = 0; misses < LOOKAHEAD && i < queue.length;) {
      const book = queue[i];
      const taken =
        book.slug === featured.slug || chosen.some((c) => c.slug === book.slug);
      if (!taken && used + GAP + book.ratio <= SHELF_WIDTH) {
        used += GAP + book.ratio;
        chosen.push(book);
        queue.splice(i, 1);
        fill();
      } else {
        misses++;
        i++;
      }
    }
    if (day === last) {
      const others = chosen.map((b) => b.slug);
      const middle = Math.floor(others.length / 2);
      shelf = {
        slugs: [
          ...others.slice(0, middle),
          featured.slug,
          ...others.slice(middle),
        ],
        featured: featured.slug,
        anniversary: special?.years,
      };
    }
  }
  return shelf;
}
