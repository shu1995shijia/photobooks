import { describe, expect, test } from "vitest";
import {
  FIRST_DAY,
  dailyShelf,
  dateOf,
  dayNumber,
  shelfFor,
  todayIn,
  yearsSince,
} from "../src/lib/daily";

const books = Array.from({ length: 23 }, (_, i) => `book-${i}`);
const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => dateOf(dayNumber(from) + i));

describe("dates", () => {
  test("round-trip, and reject dates that don't exist", () => {
    expect(dateOf(dayNumber("2026-10-22"))).toBe("2026-10-22");
    expect(dayNumber("2026-02-30")).toBeNaN();
    expect(dayNumber("22/10/2026")).toBeNaN();
  });

  test("today follows the shelf's time zone", () => {
    // 2am in London is still the evening before in New York.
    const now = new Date("2026-10-23T02:00:00Z");
    expect(todayIn("America/New_York", now)).toBe("2026-10-22");
    expect(todayIn("Asia/Shanghai", now)).toBe("2026-10-23");
  });
});

describe("shelfFor", () => {
  test("is the same every time for a date, and differs the next day", () => {
    expect(shelfFor(books, "2026-11-03")).toEqual(
      shelfFor(books, "2026-11-03"),
    );
    expect(shelfFor(books, "2026-11-03")).not.toEqual(
      shelfFor(books, "2026-11-04"),
    );
  });

  test("never puts a book on the shelf twice", () => {
    for (const date of days(FIRST_DAY, 60)) {
      const shelf = shelfFor(books, date);
      expect(shelf).toHaveLength(5);
      expect(new Set(shelf).size).toBe(5);
    }
  });

  test("shows every book before any comes back", () => {
    // 23 books, 5 a day: the first 4 days deal 20 different books.
    const seen = days(FIRST_DAY, 4).flatMap((d) => shelfFor(books, d));
    expect(new Set(seen).size).toBe(20);
  });

  test("copes with fewer books than shelf spaces, and with none", () => {
    expect(shelfFor(["a", "b"], FIRST_DAY).sort()).toEqual(["a", "b"]);
    expect(shelfFor([], FIRST_DAY)).toEqual([]);
    expect(shelfFor(books, "not a date")).toEqual([]);
  });
});

describe("yearsSince", () => {
  test("counts years on the anniversary only", () => {
    expect(yearsSince("2024-02-28", "2026-02-28")).toBe(2);
    expect(yearsSince("2024-02-28", "2026-02-27")).toBeUndefined();
    expect(yearsSince("2026-02-28", "2026-02-28")).toBeUndefined();
  });

  test("needs a full date", () => {
    expect(yearsSince("2024-02", "2026-02-01")).toBeUndefined();
    expect(yearsSince(undefined, "2026-02-01")).toBeUndefined();
  });

  test("a February 29 book keeps its anniversary on February 28", () => {
    expect(yearsSince("2024-02-29", "2025-02-28")).toBe(1);
    expect(yearsSince("2024-02-29", "2028-02-29")).toBe(4);
    expect(yearsSince("2024-02-29", "2028-02-28")).toBeUndefined();
  });
});

describe("dailyShelf", () => {
  const list = books.map((slug) => ({ slug }));

  test("puts the day's book in the middle", () => {
    const shelf = dailyShelf(list, "2026-11-03")!;
    expect(shelf.slugs).toHaveLength(5);
    expect(shelf.slugs[2]).toBe(shelf.featured);
    expect(shelf.anniversary).toBeUndefined();
  });

  test("an anniversary makes that book the day's book", () => {
    const withDates = [
      ...list,
      { slug: "a-dream", acquired: "2024-11-03" },
      { slug: "older", acquired: "2021-11-03" },
    ];
    const shelf = dailyShelf(withDates, "2026-11-03")!;
    expect(shelf.featured).toBe("older");
    expect(shelf.anniversary).toBe(5);
    expect(shelf.slugs).toHaveLength(5);
    expect(shelf.slugs[2]).toBe("older");
    expect(new Set(shelf.slugs).size).toBe(5);
  });
});
