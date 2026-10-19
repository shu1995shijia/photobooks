import type { Book } from "./book";
import { baseSlug } from "./slug";
import { sortBooks } from "./sort";

export interface Tag {
  slug: string; // "zhong-guo-ti-cai", for /tags/<slug>
  name: string; // "中国题材"
  books: Book[]; // oldest first
}

/** "中国题材" → "zhong-guo-ti-cai". */
export function tagSlug(name: string): string {
  return baseSlug(name.trim());
}

/** Every tag used in the catalog, each with all its books, sorted by name. */
export function tags(books: readonly Book[]): Tag[] {
  const bySlug = new Map<string, Tag>();
  for (const book of sortBooks(books, "year")) {
    for (const name of book.tags) {
      const slug = tagSlug(name);
      const entry = bySlug.get(slug) ?? { slug, name, books: [] };
      entry.books.push(book);
      bySlug.set(slug, entry);
    }
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
