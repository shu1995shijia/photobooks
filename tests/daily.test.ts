import { describe, expect, test } from "vitest";
import {
  FEATURED_SCALE,
  FIRST_DAY,
  GAP,
  SHELF_WIDTH,
  dailyShelf,
  dateOf,
  dayNumber,
  todayIn,
  yearsSince,
  type DailyBook,
} from "../src/lib/daily";

// Portrait, square and landscape covers, as on the real shelf.
const RATIOS = [0.72, 0.8, 1, 1.25, 0.66, 0.75];
const list: DailyBook[] = Array.from({ length: 23 }, (_, i) => ({
  slug: `book-${String(i).padStart(2, "0")}`,
  ratio: RATIOS[i % RATIOS.length],
}));
const ratio = (slug: string) => list.find((b) => b.slug === slug)!.ratio;
/** How much of the shelf a day's books take up. */
const width = (slugs: string[], featured: string, gaps: number[]) =>
  slugs.reduce(
    (w, s, i) => w + ratio(s) * (s === featured ? FEATURED_SCALE : 1) + gaps[i],
    0,
  );
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

describe("filling the shelf", () => {
  const shelf = (date: string) => dailyShelf(list, date)!;

  test("is the same every time for a date, and differs the next day", () => {
    expect(shelf("2026-11-03")).toEqual(shelf("2026-11-03"));
    expect(shelf("2026-11-03").slugs).not.toEqual(shelf("2026-11-04").slugs);
  });

  test("fills the shelf without overflowing it or repeating a book", () => {
    for (const date of days(FIRST_DAY, 60)) {
      const { slugs, featured, gaps } = shelf(date);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(gaps).toHaveLength(slugs.length);
      expect(width(slugs, featured, gaps)).toBeLessThanOrEqual(
        SHELF_WIDTH + 1e-9,
      );
      expect(slugs.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("spaces the books unevenly, and differently each day", () => {
    for (const date of days(FIRST_DAY, 30)) {
      const { gaps } = shelf(date);
      expect(gaps[0]).toBe(0);
      for (const g of gaps.slice(1)) expect(g).toBeGreaterThan(0);
      if (gaps.length > 2)
        expect(new Set(gaps.slice(1)).size).toBeGreaterThan(1);
    }
    const all = days(FIRST_DAY, 30).flatMap((d) => shelf(d).gaps.slice(1));
    expect(Math.min(...all)).toBeLessThan(GAP * 0.6);
    expect(Math.max(...all)).toBeGreaterThan(GAP * 1.6);
  });

  test("puts more books up on some days than others", () => {
    const counts = new Set(
      days(FIRST_DAY, 30).map((d) => shelf(d).slugs.length),
    );
    expect(counts.size).toBeGreaterThan(1);
  });

  test("shows every book before any comes back", () => {
    const seen: string[] = [];
    for (const date of days(FIRST_DAY, 30)) {
      seen.push(...shelf(date).slugs);
      if (seen.length >= list.length) break;
    }
    const first = seen.slice(0, list.length - 3);
    expect(new Set(first).size).toBe(first.length);
  });

  test("has no shelf before the first day, for no books, or a bad date", () => {
    expect(dailyShelf(list, dateOf(dayNumber(FIRST_DAY) - 1))).toBeUndefined();
    expect(dailyShelf([], FIRST_DAY)).toBeUndefined();
    expect(dailyShelf(list, "not a date")).toBeUndefined();
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

describe("the day's book", () => {
  test("stands in the middle", () => {
    const { slugs, featured, anniversary } = dailyShelf(list, "2026-11-03")!;
    expect(slugs.indexOf(featured)).toBe(Math.floor((slugs.length - 1) / 2));
    expect(anniversary).toBeUndefined();
  });

  test("is the book with an anniversary that day", () => {
    const withDates: DailyBook[] = [
      ...list,
      { slug: "a-dream", ratio: 0.75, acquired: "2024-11-03" },
      { slug: "older", ratio: 0.75, acquired: "2021-11-03" },
    ];
    const { slugs, featured, anniversary } = dailyShelf(
      withDates,
      "2026-11-03",
    )!;
    expect(featured).toBe("older");
    expect(anniversary).toBe(5);
    expect(slugs.indexOf("older")).toBe(Math.floor((slugs.length - 1) / 2));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
