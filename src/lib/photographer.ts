import type { Book } from "./book";
import { baseSlug, latinPart } from "./slug";
import { sortBooks, surname } from "./sort";

export interface Photographer {
  slug: string; // "eugene-richards", for /photographers/<slug>
  name: string; // as written on the first of their books
  books: Book[]; // oldest first
}

/** "Yoshihiko Ueda（上田義彦）" → "yoshihiko-ueda"; "Cornell Capa (ed.)" → "cornell-capa". */
export function photographerSlug(name: string): string {
  return baseSlug(
    latinPart(name)
      .replace(/\(.*?\)/g, "")
      .trim(),
  );
}

/** Everyone credited on a book, each with all their books, sorted by surname. */
export function photographers(books: readonly Book[]): Photographer[] {
  const bySlug = new Map<string, Photographer>();
  for (const book of sortBooks(books, "year")) {
    for (const name of book.photographers) {
      const slug = photographerSlug(name);
      const entry = bySlug.get(slug) ?? { slug, name, books: [] };
      entry.books.push(book);
      bySlug.set(slug, entry);
    }
  }
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  return [...bySlug.values()].sort(
    (a, b) =>
      collator.compare(surname(a.name), surname(b.name)) ||
      collator.compare(a.name, b.name),
  );
}
