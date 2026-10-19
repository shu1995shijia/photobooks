import type { Book } from "./book";
import { latinPart } from "./slug";
import { surname } from "./sort";

/** A possible cover from a search result, before it is accepted or rejected. */
export interface Candidate {
  title: string;
  authors: string[];
  year?: number;
  imageUrl?: string; // missing when only the book's editions have covers
  workKey?: string; // Open Library work, e.g. "/works/OL123W", to look up its editions
  source: "openlibrary" | "google";
}

/** Lowercase ASCII words: accents and punctuation removed, "&" read as "and". */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "in", "on"]);

function words(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w));
}

/**
 * The ways a title might be written in a catalog: whole, the romanized part of
 * a mixed-script title ("Coastline (海岸线)" → "Coastline"), and without its
 * subtitle ("Assignment Shanghai: Photographs on…" → "Assignment Shanghai").
 * A shortened title must keep two words that aren't just a name in `names`, so
 * "Lartigue: Life in Color" doesn't match every book called "Lartigue".
 */
export function titleVariants(title: string, names: string[] = []): string[] {
  const latin = latinPart(title);
  const nameWords = new Set(names.flatMap(words));
  const shortened = [title, latin]
    .map((t) => t.split(/:|\s[-–]\s/)[0])
    .filter((t) => {
      const w = words(t);
      return w.length >= 2 && w.some((x) => !nameWords.has(x));
    });
  const variants = [title, latin, ...shortened];
  return [...new Set(variants.map(normalize).filter(Boolean))];
}

/** Dice similarity of two word lists: 1 when they hold the same words. */
function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const rest = [...b];
  let shared = 0;
  for (const w of a) {
    const i = rest.indexOf(w);
    if (i >= 0) {
      shared++;
      rest.splice(i, 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/** 0–1: how closely the candidate's title matches any variant of the book's. */
export function titleScore(
  bookTitle: string,
  candidateTitle: string,
  names: string[] = [],
): number {
  const ours = titleVariants(bookTitle, names);
  const theirs = titleVariants(candidateTitle, names);
  let best = 0;
  for (const a of ours) {
    for (const b of theirs) {
      // Comparing words, not letters, so "China" never matches "China After Mao".
      best = Math.max(best, a === b ? 1 : dice(words(a), words(b)));
    }
  }
  return best;
}

/** Surnames to look for in a candidate's author list, e.g. ["frank"]. */
export function surnames(book: Pick<Book, "photographers">): string[] {
  return book.photographers
    .map((name) => normalize(surname(name)))
    .filter((s) => s.length >= 2);
}

/** True when any candidate author has one of the book's photographers' surnames as a whole word. */
export function authorMatches(
  book: Pick<Book, "photographers">,
  authors: string[],
): boolean {
  const wanted = surnames(book);
  return authors.some((author) => {
    const name = ` ${normalize(author)} `;
    return wanted.some((s) => name.includes(` ${s} `));
  });
}

/** A title at least this close is accepted, if the photographer matches too. */
export const TITLE_THRESHOLD = 0.8;

/**
 * The candidates close enough to be `book`, best first. A miss is better than
 * a wrong cover, so both title and photographer must match. A book with no
 * photographer needs an exact title and a matching year.
 */
export function rankMatches(
  book: Pick<Book, "title" | "photographers" | "year">,
  candidates: readonly Candidate[],
): Candidate[] {
  const scored: { candidate: Candidate; score: number }[] = [];
  for (const candidate of candidates) {
    const names = [...book.photographers, ...candidate.authors];
    let score = titleScore(book.title, candidate.title, names);
    if (book.photographers.length > 0) {
      if (score < TITLE_THRESHOLD || !authorMatches(book, candidate.authors))
        continue;
    } else if (score < 1 || !book.year || candidate.year !== book.year) {
      continue;
    }
    // Between equal titles, prefer the edition from the same year, then one with a cover.
    if (book.year && candidate.year === book.year) score += 0.1;
    if (candidate.imageUrl) score += 0.05;
    scored.push({ candidate, score });
  }
  // A stable sort, so equal scores keep the search engine's order.
  return scored.sort((a, b) => b.score - a.score).map((s) => s.candidate);
}

export function bestMatch(
  book: Pick<Book, "title" | "photographers" | "year">,
  candidates: readonly Candidate[],
): Candidate | undefined {
  return rankMatches(book, candidates)[0];
}
