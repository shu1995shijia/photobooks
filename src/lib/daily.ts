/**
 * The daily shelf: a few books a day, the same for everyone that day. The
 * books are dealt from a shuffled deck: no book comes back until every other
 * one has had its turn, then the deck is shuffled again. Everything follows
 * from the date, so the site stays static. (Adding a book reshuffles the
 * deck, so earlier days can change after the catalog does.)
 */

/** How many books stand on the shelf each day. */
export const SHELF_SIZE = 5;
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
 * The books on the shelf on `date`, dealt from the decks in turn. When a
 * deck runs out partway through a shelf, the rest come from the next deck,
 * skipping any already on this shelf.
 */
export function shelfFor<T>(
  items: readonly T[],
  date: string,
  size = SHELF_SIZE,
): T[] {
  const day = dayNumber(date) - dayNumber(FIRST_DAY);
  const n = items.length;
  if (n === 0 || Number.isNaN(day)) return [];
  const count = Math.min(size, n);
  // Days before the first shelf still get a shelf; they just count backwards.
  let at = (((day * count) % n) + n) % n;
  let round = Math.floor((day * count) / n);
  const out: T[] = [];
  let current = deck(items, round);
  while (out.length < count) {
    if (at === n) {
      round++;
      at = 0;
      current = deck(items, round);
    }
    const item = current[at++];
    if (!out.includes(item)) out.push(item);
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
 * The shelf for `date`. A book that joined the collection on this day in an
 * earlier year is the day's book (the longest-held one, if there are a few);
 * otherwise it's the first one dealt. Either way it stands in the middle.
 */
export function dailyShelf(
  books: readonly DailyBook[],
  date: string,
  size = SHELF_SIZE,
): DailyShelf | undefined {
  const dealt = shelfFor(
    books.map((b) => b.slug),
    date,
    size,
  );
  if (dealt.length === 0) return undefined;
  const anniversaries = books
    .map((b) => ({ slug: b.slug, years: yearsSince(b.acquired, date) }))
    .filter((a): a is { slug: string; years: number } => a.years !== undefined)
    .sort((a, b) => b.years - a.years || a.slug.localeCompare(b.slug));
  const special = anniversaries[0];
  const featured = special?.slug ?? dealt[0];
  const others = dealt.filter((s) => s !== featured).slice(0, dealt.length - 1);
  const middle = Math.floor(others.length / 2);
  return {
    slugs: [...others.slice(0, middle), featured, ...others.slice(middle)],
    featured,
    anniversary: special?.years,
  };
}
