import { describe, expect, test } from "vitest";
import books from "../src/data/books.json";
import type { Book } from "../src/lib/book";
import { photographerSlug, photographers } from "../src/lib/photographer";

const book = (slug: string, names: string[], year?: number): Book => ({
  slug,
  title: slug,
  photographers: names,
  year,
  tags: [],
});

describe("photographerSlug", () => {
  test("uses the romanized name and drops notes in brackets", () => {
    expect(photographerSlug("Eugene Richards")).toBe("eugene-richards");
    expect(photographerSlug("Yoshihiko Ueda（上田義彦）")).toBe(
      "yoshihiko-ueda",
    );
    expect(photographerSlug("Cornell Capa (ed.)")).toBe("cornell-capa");
    expect(photographerSlug("Uğur Gallenkuş")).toBe("ugur-gallenkus");
  });
});

describe("photographers", () => {
  test("gives each person their books, oldest first, under one page for every spelling", () => {
    const list = photographers([
      book("dream", ["Yoshihiko Ueda（上田義彦）"], 2008),
      book("home", ["Yoshihiko Ueda"], 2006),
      book("darkness", ["Greg Girard", "Ian Lambot"], 1993),
    ]);
    expect(list.map((p) => p.slug)).toEqual([
      "greg-girard",
      "ian-lambot",
      "yoshihiko-ueda",
    ]);
    expect(list[2].books.map((b) => b.slug)).toEqual(["home", "dream"]);
    expect(list[1].books.map((b) => b.slug)).toEqual(["darkness"]); // a shared book is on both pages
  });

  test("leaves out books with no photographer", () => {
    expect(photographers([book("anon", [])])).toEqual([]);
  });

  test("gives every photographer in the catalog a different page", () => {
    const list = photographers(books as Book[]);
    expect(new Set(list.map((p) => p.slug)).size).toBe(list.length);
    expect(list.find((p) => p.slug === "eugene-richards")?.books).toHaveLength(
      7,
    );
  });
});
