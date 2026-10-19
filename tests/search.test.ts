import { describe, expect, test } from "vitest";
import type { Book } from "../src/lib/book";
import {
  matchesSearch,
  searchText,
  suggest,
  suggestions,
} from "../src/lib/search";
import { noneText } from "../src/scripts/search";

const atget: Book = {
  slug: "old-paris-and-changing-new-york-eugene-atget",
  title: "Old Paris and Changing New York",
  photographers: ["Eugène Atget", "Berenice Abbott"],
  colorType: "Black & White",
  region: "France / USA",
  genre: "Urban History",
  year: 2018,
  publisher: "Yale University Press",
  tags: [],
};

const luNan: Book = {
  slug: "four-seasons-lu-nan",
  title: "四季 (Four Seasons)",
  photographers: ["Lu Nan (吕楠)"],
  colorType: "Black & White",
  region: "China",
  year: 2014,
  publisher: "中国民族摄影艺术出版社",
  tags: ["中国摄影师", "中国题材"],
  location: "Beijing, China",
};

describe("matchesSearch", () => {
  const text = searchText(atget);

  test("finds a book by any attribute, ignoring case and accents", () => {
    for (const query of [
      "paris",
      "EUGENE",
      "eugène",
      "abbott",
      "2018",
      "yale",
      "urban",
      "usa",
      "black and white",
      "black & white",
      "brooklyn", // the default location
    ])
      expect(matchesSearch(text, query), query).toBe(true);
  });

  test("needs every word, in any order", () => {
    expect(matchesSearch(text, "atget 2018")).toBe(true);
    expect(matchesSearch(text, "2018 atget")).toBe(true);
    expect(matchesSearch(text, "atget 2019")).toBe(false);
  });

  test("matches the start of a word as it's typed", () => {
    expect(matchesSearch(text, "chang")).toBe(true);
  });

  test("an empty or blank search matches everything", () => {
    expect(matchesSearch(text, "")).toBe(true);
    expect(matchesSearch(text, "   ")).toBe(true);
  });

  test("finds Chinese titles, names and tags", () => {
    const zh = searchText(luNan);
    for (const query of ["四季", "吕楠", "lu nan", "中国题材", "beijing"])
      expect(matchesSearch(zh, query), query).toBe(true);
    expect(matchesSearch(zh, "brooklyn")).toBe(false);
  });
});

describe("noneText", () => {
  test("says what was searched for, and where", () => {
    expect(noneText("atget", null)).toBe("No books match “atget”.");
    expect(noneText("atget", "Beijing, China")).toBe(
      "No books kept in Beijing, China match “atget”.",
    );
    expect(noneText("", "Beijing, China")).toBe(
      "No books are kept in Beijing, China yet.",
    );
  });
});

describe("suggestions", () => {
  const all = suggestions([
    atget,
    luNan,
    { ...luNan, slug: "x", title: "在路上 (On the Road)" },
  ]);

  test("offers every attribute's values, once each, counting their books", () => {
    const find = (kind: string, value: string) =>
      all.find((s) => s.kind === kind && s.value === value);
    expect(find("Photographer", "Eugène Atget")?.count).toBe(1);
    expect(find("Photographer", "Lu Nan (吕楠)")?.count).toBe(2);
    expect(find("Publisher", "Yale University Press")).toBeDefined();
    expect(find("Region", "France")).toBeDefined(); // split on "/"
    expect(find("Region", "USA")).toBeDefined();
    expect(find("Year", "2014")?.count).toBe(2);
    expect(find("Tag", "中国题材")?.count).toBe(2);
    expect(find("Location", "Beijing, China")?.count).toBe(2);
    expect(find("Location", "Brooklyn, NY")?.count).toBe(1);
    expect(find("Color", "Black and white")?.count).toBe(3);
  });

  test("lists photographers first and newest years first", () => {
    expect(all[0].kind).toBe("Photographer");
    const years = all.filter((s) => s.kind === "Year").map((s) => s.value);
    expect(years).toEqual(["2018", "2014"]);
  });

  test("narrows to what's typed, and shows all when nothing is", () => {
    expect(suggest(all, "")).toHaveLength(all.length);
    expect(suggest(all, "yale").map((s) => s.value)).toEqual([
      "Yale University Press",
    ]);
    expect(suggest(all, "吕").map((s) => s.kind)).toEqual(["Photographer"]);
  });
});

test("a book isn't found by the date it joined the collection", () => {
  const bought = { ...atget, acquired: "2024-02-28" };
  expect(searchText(bought)).toBe(searchText(atget));
  expect(suggestions([bought]).map((s) => s.value)).not.toContain("2024-02-28");
});
