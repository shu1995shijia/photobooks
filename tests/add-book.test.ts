import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { addTo, validate } from "../scripts/add-book";
import { findCorners } from "../scripts/corners";
import type { Quad } from "../scripts/flatten";
import { mergeAdded } from "../scripts/import";
import type { Book } from "../src/lib/book";

const catalog: Book[] = [
  {
    slug: "songbook-alec-soth",
    title: "Songbook",
    photographers: ["Alec Soth"],
    tags: [],
  },
];

describe("validate", () => {
  test("tidies text and leaves out empty fields", () => {
    expect(
      validate({
        title: "  Sleeping by the\nMississippi ",
        photographers: ["Alec Soth", " "],
        colorType: "Color",
        year: 2004,
        publisher: "",
        tags: [],
      }),
    ).toEqual({
      title: "Sleeping by the Mississippi",
      photographers: ["Alec Soth"],
      colorType: "Color",
      year: 2004,
      tags: [],
    });
  });

  test("refuses what the site can't show", () => {
    expect(() => validate({ photographers: [] })).toThrow("title is required");
    expect(() => validate({ title: "X", colorType: "Sepia" })).toThrow(
      "colorType",
    );
    expect(() => validate({ title: "X", year: "2004" })).toThrow("year");
    expect(() => validate({ title: "X", isbn: "123" })).toThrow(
      "unknown fields: isbn",
    );
  });
});

describe("addTo", () => {
  test("gives a new book a slug of its own", () => {
    expect(
      addTo(catalog, {
        title: "Sleeping by the Mississippi",
        photographers: ["Alec Soth"],
        tags: [],
      }).slug,
    ).toBe("sleeping-by-the-mississippi-alec-soth");
    expect(
      addTo(catalog, {
        title: "Songbook",
        photographers: ["Alec  Soth Jr"],
        tags: [],
      }).slug,
    ).not.toBe("songbook-alec-soth");
  });

  test("refuses a book that's already in the catalog", () => {
    expect(() =>
      addTo(catalog, {
        title: "songbook",
        photographers: ["Alec Soth"],
        tags: [],
      }),
    ).toThrow("already in the catalog as songbook-alec-soth");
  });
});

describe("mergeAdded", () => {
  const added: Book = {
    slug: "dream-a",
    title: "Dream",
    photographers: ["A"],
    tags: [],
  };

  test("appends added books after the Notion ones, keeping their slugs", () => {
    expect(mergeAdded(catalog, [added]).books.map((b) => b.slug)).toEqual([
      "songbook-alec-soth",
      "dream-a",
    ]);
  });

  test("drops an added book once Notion has it, with a reminder", () => {
    const fromNotion = [...catalog, { ...added, slug: "dream-a" }];
    const { books, warnings } = mergeAdded(fromNotion, [added]);
    expect(books).toHaveLength(2);
    expect(warnings[0]).toContain('"Dream" is in Notion now');
  });
});

describe("findCorners", () => {
  test("finds a tilted dark book on a light background from rough guesses", async () => {
    const book: Quad = [
      [60, 40],
      [330, 55],
      [320, 380],
      [50, 370],
    ];
    const svg = `<svg width="400" height="420"><rect width="400" height="420" fill="#ddd"/>
      <polygon points="${book.map((p) => p.join(",")).join(" ")}" fill="#222"/></svg>`;
    const photo = await sharp(Buffer.from(svg)).png().toBuffer();
    const rough: Quad = [
      [70, 50],
      [320, 50],
      [312, 372],
      [58, 362],
    ];
    const { corners } = await findCorners(photo, rough, 20);
    corners.forEach(([x, y], i) => {
      expect(Math.abs(x - book[i][0])).toBeLessThanOrEqual(2);
      expect(Math.abs(y - book[i][1])).toBeLessThanOrEqual(2);
    });
  });
});
