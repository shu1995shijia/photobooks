import type { Book } from "./book";
import { latinPart } from "./slug";

export type SortKey = "photographer" | "title" | "year";

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

/** "Henri Cartier-Bresson" → "Cartier-Bresson"; "木村伊兵衛" stays whole. Strips "(ed.)" and similar. */
export function surname(name: string): string {
  const cleaned = latinPart(name)
    .replace(/\(.*?\)/g, "")
    .trim();
  const words = cleaned.split(/\s+/);
  return words[words.length - 1] ?? cleaned;
}

function compareBy(key: SortKey, a: Book, b: Book): number {
  switch (key) {
    case "photographer": {
      // Books with no photographer go last.
      const pa = a.photographers[0];
      const pb = b.photographers[0];
      if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
      return (
        collator.compare(surname(pa), surname(pb)) || collator.compare(pa, pb)
      );
    }
    case "title":
      return collator.compare(latinPart(a.title), latinPart(b.title));
    case "year":
      // Undated books go last.
      return (a.year ?? Infinity) - (b.year ?? Infinity);
  }
}

/** Sorts by `key`, then by year and title, so the order is always the same. Does not mutate. */
export function sortBooks(books: readonly Book[], key: SortKey): Book[] {
  return [...books].sort(
    (a, b) =>
      compareBy(key, a, b) ||
      compareBy("year", a, b) ||
      compareBy("title", a, b) ||
      collator.compare(a.slug, b.slug),
  );
}
