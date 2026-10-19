import { describe, expect, test } from "vitest";
import type { Book } from "../src/lib/book";
import { popupData } from "../src/lib/popup";

describe("popupData", () => {
  const book: Book = {
    slug: "city-of-darkness-life-in-kowloon-walled-city-greg-girard",
    title: "City of Darkness",
    photographers: ["Greg Girard", "Ian Lambot"],
    colorType: "Mixed",
    region: "Hong Kong",
    year: 1993,
    publisher: "Watermark",
    tags: ["中国题材"],
  };

  test("carries the wall label, with each photographer linked", () => {
    const entry = popupData([book])[book.slug];
    expect(entry.byline).toBe("Greg Girard and Ian Lambot");
    // The base path depends on where it runs ("/photobooks/" on the site).
    expect(entry.names.map((n) => n.href)).toEqual([
      expect.stringMatching(/\/photographers\/greg-girard$/),
      expect.stringMatching(/\/photographers\/ian-lambot$/),
    ]);
    expect(entry.details).toEqual(["Watermark", "Color and black and white"]);
    expect(entry.rows).toEqual([
      ["Country or region", "Hong Kong"],
      [
        "Tag",
        [
          {
            name: "中国题材",
            href: expect.stringMatching(/\/tags\/zhong-guo-ti-cai$/),
          },
        ],
      ],
      ["Location", "Brooklyn, NY"],
    ]);
    expect(entry.href).toMatch(new RegExp(`/books/${book.slug}$`));
  });

  test("gives a book without a cover a placeholder's shape and colours", () => {
    const entry = popupData([
      { slug: "no-such-cover", title: "X", photographers: [], tags: [] },
    ])["no-such-cover"];
    expect(entry.cover).toBeUndefined();
    expect(entry.ratio).toBe(0.8);
    expect(entry.tone.bg).toMatch(/^#/);
  });
});
