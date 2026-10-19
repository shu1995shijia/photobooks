import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseCatalog } from "../scripts/import";

const csv = readFileSync(
  new URL("./fixtures/sample.csv", import.meta.url),
  "utf8",
);

describe("parseCatalog", () => {
  const { books, warnings } = parseCatalog(csv);
  const byTitle = (title: string) => books.filter((b) => b.title === title);

  test("skips blank rows", () => {
    expect(books).toHaveLength(7);
  });

  test("keeps only public columns", () => {
    const json = JSON.stringify(books);
    expect(json).not.toContain("January 1, 2000");
    expect(json).not.toContain("A private note");
    for (const book of books) {
      expect(Object.keys(book).sort()).toEqual(
        expect.arrayContaining(["slug", "title", "photographers", "tags"]),
      );
      expect(book).not.toHaveProperty("purchaseDate");
      expect(book).not.toHaveProperty("description");
    }
  });

  test("trims stray newlines and whitespace", () => {
    const [peking] = byTitle("A Photographer in Old Peking");
    expect(peking.photographers).toEqual(["Hedda Morrison"]);
  });

  test("splits photographers on ';' and tags on ','", () => {
    expect(
      byTitle("City of Darkness: Life in Kowloon Walled City")[0].photographers,
    ).toEqual(["Greg Girard", "Ian Lambot"]);
    expect(byTitle("China Adagio (漫游中国)")[0].tags).toEqual([
      "中国摄影师",
      "中国题材",
    ]);
  });

  test("keeps both books titled 'China', with different slugs", () => {
    const chinas = byTitle("China");
    expect(chinas).toHaveLength(2);
    expect(new Set(chinas.map((b) => b.slug)).size).toBe(2);
  });

  test("handles a missing photographer and missing fields", () => {
    expect(byTitle("China: A Photo History")[0].photographers).toEqual([]);
    const layma = byTitle("China").find(
      (b) => b.photographers[0] === "Yann Layma",
    )!;
    expect(layma.year).toBeUndefined();
    expect(layma.publisher).toBeUndefined();
  });

  test("parses year and colour type", () => {
    const [frank] = byTitle("The Americans");
    expect(frank.year).toBe(1959);
    expect(frank.colorType).toBe("Black & White");
    expect(warnings).toEqual([]);
  });

  test("slugs are unique and URL-safe", () => {
    const slugs = books.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("keeps earlier slugs on re-import", () => {
    const previous = books.map((b) =>
      b.title === "The Americans" ? { ...b, slug: "americans" } : b,
    );
    const again = parseCatalog(csv, previous).books;
    expect(again.find((b) => b.title === "The Americans")!.slug).toBe(
      "americans",
    );
    expect(again.map((b) => b.slug)).toEqual(previous.map((b) => b.slug));
  });

  test("rejects a CSV missing a required column", () => {
    expect(() => parseCatalog("Name,Genre\nX,Y\n")).toThrow(
      /missing these columns/,
    );
  });
});

describe("Location column", () => {
  const header = "Name,Author / Photographer,Color Type,Country / Region,Genre,Publish Year,Publisher,Tags";

  test("is optional: without it, books have no location of their own", () => {
    const { books } = parseCatalog(`${header}\nSongbook,Alec Soth,Color,,,2015,,\n`);
    expect(books[0].location).toBeUndefined();
  });

  test("is read when the export has it", () => {
    const { books } = parseCatalog(
      `${header},Location\nSongbook,Alec Soth,Color,,,2015,,, Shanghai \nExiles,Josef Koudelka,Black & White,,,1988,,,\n`,
    );
    expect(books.map((b) => b.location)).toEqual(["Shanghai", undefined]);
  });
});
