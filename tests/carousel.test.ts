import { describe, expect, test } from "vitest";
import books from "../src/data/books.json";
import type { Book } from "../src/lib/book";
import { placeholderTone } from "../src/lib/cover";
import { VISIBLE, offset, position, wrap } from "../src/scripts/carousel";

describe("offset", () => {
  test("is negative to the left and positive to the right", () => {
    expect(offset(4, 5, 71)).toBe(-1);
    expect(offset(5, 5, 71)).toBe(0);
    expect(offset(8, 5, 71)).toBe(3);
  });

  test("goes the short way round at the ends", () => {
    expect(offset(70, 0, 71)).toBe(-1);
    expect(offset(0, 70, 71)).toBe(1);
    expect(offset(35, 0, 71)).toBe(35);
    expect(offset(36, 0, 71)).toBe(-35);
  });

  test("handles one and two books", () => {
    expect(offset(0, 0, 1)).toBe(0);
    expect(offset(1, 0, 2)).toBe(1);
  });
});

describe("position", () => {
  test("shows VISIBLE books each side, then lays out a few more unseen", () => {
    expect(position(0)).toBe("current");
    expect(position(-VISIBLE)).toBe("side");
    expect(position(VISIBLE + 1)).toBe("edge");
    expect(position(VISIBLE + 3)).toBeUndefined();
  });
});

describe("wrap", () => {
  test("wraps negative and overflowing indexes", () => {
    expect(wrap(-1, 71)).toBe(70);
    expect(wrap(71, 71)).toBe(0);
  });
});

/** WCAG relative luminance contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("placeholder covers", () => {
  test("every book's cover text is readable (4.5:1)", () => {
    for (const book of books as Book[]) {
      const { bg, fg } = placeholderTone(book);
      expect(
        contrast(bg, fg),
        `${book.title}: ${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("a book keeps the same colour", () => {
    const book = (books as Book[])[0];
    expect(placeholderTone(book)).toEqual(placeholderTone({ ...book }));
  });
});
