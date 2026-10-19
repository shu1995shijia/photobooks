import { colorTypeLabel, locationOf, type Book } from "./book";
import { normalize } from "./match";

/** Everything a search can find a book by, normalized once at build time. */
export function searchText(book: Book): string {
  return normalize(
    [
      book.title,
      ...book.photographers,
      book.colorType,
      colorTypeLabel(book.colorType),
      book.region,
      book.genre,
      book.year,
      book.publisher,
      ...book.tags,
      locationOf(book),
    ]
      .filter((part) => part !== undefined && part !== "")
      .join(" "),
  );
}

/** Whether every word of `query` appears in `text` (from searchText); an empty query matches all. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  return words.every((word) => text.includes(word));
}

/** The kinds of suggestion, in the order the list shows them. */
export const SUGGESTION_KINDS = [
  "Photographer",
  "Title",
  "Publisher",
  "Genre",
  "Region",
  "Year",
  "Tag",
  "Location",
  "Color",
] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface Suggestion {
  value: string;
  kind: SuggestionKind;
  count: number; // how many books searching for it finds
}

/**
 * Every value a search can be filled in with, once each per kind. Genres and
 * regions split on "/", so "Urban History" is offered on its own.
 */
export function suggestions(books: Book[]): Suggestion[] {
  const found = new Map<string, Suggestion>();
  const add = (kind: SuggestionKind, value: string | number | undefined) => {
    const text = String(value ?? "").trim();
    const key = `${kind}\u0000${normalize(text)}`;
    if (text && !found.has(key))
      found.set(key, { value: text, kind, count: 0 });
  };
  const parts = (text?: string) => (text ?? "").split("/");
  for (const book of books) {
    book.photographers.forEach((name) => add("Photographer", name));
    add("Title", book.title);
    add("Publisher", book.publisher);
    parts(book.genre).forEach((genre) => add("Genre", genre));
    parts(book.region).forEach((region) => add("Region", region));
    add("Year", book.year);
    book.tags.forEach((tag) => add("Tag", tag));
    add("Location", locationOf(book));
    add("Color", colorTypeLabel(book.colorType));
  }
  // Counted the way the search finds books, so the number is what a pick shows.
  const texts = books.map(searchText);
  for (const s of found.values())
    s.count = texts.filter((text) => matchesSearch(text, s.value)).length;
  const order = (s: Suggestion) => SUGGESTION_KINDS.indexOf(s.kind);
  return [...found.values()].sort(
    (a, b) =>
      order(a) - order(b) ||
      (a.kind === "Year"
        ? Number(b.value) - Number(a.value)
        : a.value.localeCompare(b.value)),
  );
}

/** The suggestions matching what's typed so far, all of them when nothing is. */
export function suggest(all: Suggestion[], query: string): Suggestion[] {
  return all.filter((s) => matchesSearch(normalize(s.value), query));
}
