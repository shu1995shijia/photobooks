import { describe, expect, test } from "vitest";
import books from "../src/data/books.json";
import type { Book } from "../src/lib/book";
import { tagSlug, tags } from "../src/lib/tag";

const book = (slug: string, tagList: string[], year?: number): Book => ({
  slug,
  title: slug,
  photographers: [],
  year,
  tags: tagList,
});

describe("tagSlug", () => {
  test("transliterates the tag", () => {
    expect(tagSlug("中国题材")).toBe("zhong-guo-ti-cai");
    expect(tagSlug("中国摄影师")).toBe("zhong-guo-she-ying-shi");
  });
});

describe("tags", () => {
  test("gathers every book with a tag, oldest first", () => {
    const list = tags([
      book("later", ["中国题材", "中国摄影师"], 2014),
      book("earlier", ["中国题材"], 1985),
      book("untagged", []),
    ]);
    expect(list.map((t) => t.name)).toEqual(["中国摄影师", "中国题材"]);
    expect(list[1].books.map((b) => b.slug)).toEqual(["earlier", "later"]);
    expect(list[0].books.map((b) => b.slug)).toEqual(["later"]);
  });

  test("gives every tag in the catalog a different page", () => {
    const list = tags(books as Book[]);
    expect(new Set(list.map((t) => t.slug)).size).toBe(list.length);
    expect(list.find((t) => t.name === "中国题材")?.books).toHaveLength(24);
  });
});
