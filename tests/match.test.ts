import { describe, expect, test, vi } from "vitest";
import type { Book } from "../src/lib/book";
import {
  authorMatches,
  bestMatch,
  normalize,
  titleScore,
  type Candidate,
} from "../src/lib/match";
import sharp from "sharp";
import {
  findCover,
  isbnOf,
  matchUploads,
  searchAuthor,
  searchOpenLibrary,
  trimBorder,
  withRetries,
} from "../scripts/covers";

const book = (over: Partial<Book>): Book => ({
  slug: "x",
  title: "Untitled",
  photographers: [],
  tags: [],
  ...over,
});

const candidate = (over: Partial<Candidate>): Candidate => ({
  title: "Untitled",
  authors: [],
  imageUrl: "https://example.com/cover.jpg",
  source: "openlibrary",
  ...over,
});

describe("normalize", () => {
  test("drops accents and punctuation, reads & as and", () => {
    expect(normalize("Eugène Atget: Paris")).toBe("eugene atget paris");
    expect(normalize("War & Peace")).toBe("war and peace");
    expect(normalize("Uğur Gallenkuş")).toBe("ugur gallenkus");
  });
});

describe("titleScore", () => {
  test("matches the same title written differently", () => {
    expect(titleScore("The Americans", "the americans")).toBe(1);
    expect(titleScore("Do I Know You?", "Do I know you")).toBe(1);
  });

  test("matches a title with or without its subtitle", () => {
    expect(
      titleScore(
        "Assignment Shanghai: Photographs on the Eve of Revolution",
        "Assignment Shanghai",
      ),
    ).toBe(1);
    expect(titleScore("Phantom Shanghai", "Phantom Shanghai: photographs")).toBe(1);
  });

  test("uses the English part of a mixed-script title", () => {
    expect(titleScore("Coastline (海岸线)", "Coastline")).toBe(1);
  });

  test("doesn't match a longer title that only starts the same", () => {
    expect(titleScore("China", "China After Mao")).toBeLessThan(0.8);
    expect(titleScore("China", "China 1948–1958, 1959")).toBeLessThan(0.8);
  });

  test("doesn't shorten a title down to the photographer's name", () => {
    expect(
      titleScore("Lartigue: Life in Color", "Lartigue", ["Jacques Henri Lartigue"]),
    ).toBeLessThan(0.8);
    expect(
      titleScore("Elliott Erwitt: Personal Best", "Elliott Erwitt: Snaps", [
        "Elliott Erwitt",
      ]),
    ).toBeLessThan(0.8);
  });
});

describe("authorMatches", () => {
  test("looks for the surname as a whole word", () => {
    const frank = book({ photographers: ["Robert Frank"] });
    expect(authorMatches(frank, ["Frank, Robert"])).toBe(true);
    expect(authorMatches(frank, ["Robert Franklin"])).toBe(false);
  });

  test("ignores accents and editor notes", () => {
    expect(
      authorMatches(book({ photographers: ["Jean-Claude Gautrand (ed.)"] }), [
        "Jean Claude Gautrand",
      ]),
    ).toBe(true);
    expect(
      authorMatches(book({ photographers: ["Eugène Atget"] }), ["Eugene Atget"]),
    ).toBe(true);
  });
});

describe("bestMatch", () => {
  const americans = book({
    title: "The Americans",
    photographers: ["Robert Frank"],
    year: 1959,
  });

  test("rejects a same-titled book by someone else", () => {
    // The first Open Library result for this search is a Western anthology.
    const western = candidate({
      title: "The Americans",
      authors: ["Martin H. Greenberg", "Louis L'Amour"],
    });
    expect(bestMatch(americans, [western])).toBeUndefined();
  });

  test("accepts a close title by the right photographer", () => {
    const right = candidate({ title: "The Americans", authors: ["Robert Frank"] });
    expect(bestMatch(americans, [right])).toBe(right);
  });

  test("prefers the edition from the same year", () => {
    const later = candidate({ title: "The Americans", authors: ["Robert Frank"], year: 2008 });
    const first = candidate({ title: "The Americans", authors: ["Robert Frank"], year: 1959 });
    expect(bestMatch(americans, [later, first])).toBe(first);
  });

  test("a book with no photographer needs the exact title and year", () => {
    const history = book({ title: "China: A Photo History", year: 1988 });
    expect(
      bestMatch(history, [candidate({ title: "China: a photo history", year: 1990 })]),
    ).toBeUndefined();
    const exact = candidate({ title: "China: a photo history", year: 1988 });
    expect(bestMatch(history, [exact])).toBe(exact);
  });
});

describe("findCover", () => {
  const americans = book({ title: "The Americans", photographers: ["Robert Frank"] });
  const right = candidate({ title: "The Americans", authors: ["Robert Frank"] });
  const keep = async (c: Candidate) => c;

  test("uses Open Library first and skips Google when it matches", async () => {
    const google = vi.fn(async () => [{ ...right, source: "google" as const }]);
    const found = await findCover(americans, { openLibrary: async () => [right], google }, keep);
    expect(found).toBe(right);
    expect(google).not.toHaveBeenCalled();
  });

  test("falls back to Google when Open Library has no close match", async () => {
    const fromGoogle = { ...right, source: "google" as const };
    const found = await findCover(
      americans,
      { openLibrary: async () => [candidate({ title: "Other" })], google: async () => [fromGoogle] },
      keep,
    );
    expect(found).toBe(fromGoogle);
  });

  test("tries the next match when one's image can't be used", async () => {
    const tiny = { ...right, imageUrl: "https://example.com/tiny.jpg" };
    const good = { ...right, imageUrl: "https://example.com/good.jpg" };
    const found = await findCover(
      americans,
      { openLibrary: async () => [tiny, good] },
      async (c) => (c === tiny ? undefined : c),
    );
    expect(found).toBe(good);
  });

  test("is a miss when neither matches", async () => {
    const found = await findCover(
      americans,
      { openLibrary: async () => [], google: async () => [] },
      keep,
    );
    expect(found).toBeUndefined();
  });
});

describe("searchAuthor", () => {
  test("uses the full name, without editor notes", () => {
    expect(searchAuthor(book({ photographers: ["Robert Frank"] }))).toBe("Robert Frank");
    expect(searchAuthor(book({ photographers: ["Jean-Claude Gautrand (ed.)"] }))).toBe(
      "Jean-Claude Gautrand",
    );
    expect(searchAuthor(book({ photographers: ["Zhang Xiao（张晓）"] }))).toBe("Zhang Xiao");
    expect(searchAuthor(book({}))).toBeUndefined();
  });
});

describe("searchOpenLibrary", () => {
  test("searches by title and full name, and keeps results without a cover for their editions", async () => {
    const fetcher = vi.fn(async (_url: string) =>
      Response.json({
        docs: [
          { title: "The Americans", author_name: ["Robert Frank"], cover_i: 42 },
          { key: "/works/OL1W", title: "The Americans", author_name: ["Robert Frank"] },
        ],
      }),
    );
    const results = await searchOpenLibrary(
      book({ title: "The Americans", photographers: ["Robert Frank"] }),
      fetcher,
    );
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("title")).toBe("The Americans");
    expect(url.searchParams.get("author")).toBe("Robert Frank");
    expect(results).toHaveLength(2);
    expect(results[0].imageUrl).toBe(
      "https://covers.openlibrary.org/b/id/42-L.jpg?default=false",
    );
    expect(results[1]).toMatchObject({ imageUrl: undefined, workKey: "/works/OL1W" });
  });
});

describe("isbnOf", () => {
  test("accepts ISBN-10 and ISBN-13, with or without a prefix", () => {
    expect(isbnOf("9783865215840")).toBe("9783865215840");
    expect(isbnOf("isbn:978-3-86521-584-0")).toBe("9783865215840");
    expect(isbnOf("080506354X")).toBe("080506354X");
  });

  test("leaves URLs and file paths alone", () => {
    expect(isbnOf("https://example.com/1234567890.jpg")).toBeUndefined();
    expect(isbnOf("data/covers/frank.jpg")).toBeUndefined();
  });
});

describe("trimBorder", () => {
  const cover = (size: number, color: string) =>
    sharp({ create: { width: size, height: size, channels: 3, background: color } })
      .png()
      .toBuffer();
  const framed = async (inner: number, color: string) =>
    sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } })
      .composite([{ input: await cover(inner, color), gravity: "centre" }])
      .png()
      .toBuffer();

  test("cuts a white border away", async () => {
    const out = await trimBorder(await framed(340, "#28465c"));
    expect(await sharp(out).metadata()).toMatchObject({ width: 340, height: 340 });
  });

  test("leaves a pale cover alone rather than trimming it to its lettering", async () => {
    const image = await framed(120, "#000000"); // a small black title on a white cover
    expect(await trimBorder(image)).toBe(image);
  });

  test("won't trim deep into a pale cover, even when asked", async () => {
    // A white cover on white: all the trim finds is two bits of lettering.
    const mark = await cover(20, "#000000");
    const image = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } })
      .composite([
        { input: mark, left: 100, top: 100 },
        { input: mark, left: 280, top: 280 },
      ])
      .png()
      .toBuffer();
    expect(await trimBorder(image, 0.25)).toBe(image);
  });

  test("shaves a hairline round the image before trimming the border inside it", async () => {
    const image = await sharp(await framed(340, "#28465c"))
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: "#a8a8a8" })
      .png()
      .toBuffer();
    expect(await sharp(await trimBorder(image)).metadata()).toMatchObject({ width: 340, height: 340 });
  });

  test("trims deeper when asked, for a product photo of the book on a backdrop", async () => {
    const out = await trimBorder(await framed(260, "#28465c"), 0.5);
    expect(await sharp(out).metadata()).toMatchObject({ width: 260, height: 260 });
  });
});

describe("withRetries", () => {
  const replies = (...statuses: number[]) => {
    const fetcher = vi.fn<(url: string) => Promise<Response>>();
    for (const status of statuses)
      fetcher.mockResolvedValueOnce(new Response(null, { status }));
    return fetcher;
  };

  test("retries a 503 until the server answers", async () => {
    const fetcher = replies(503, 503, 200);
    const res = await withRetries(fetcher, [0, 0, 0])("https://example.test");
    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test("gives up after the last retry", async () => {
    const fetcher = replies(503, 503);
    const res = await withRetries(fetcher, [0])("https://example.test");
    expect(res.status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("doesn't retry a quota error", async () => {
    const fetcher = replies(429);
    const res = await withRetries(fetcher, [0])("https://example.test");
    expect(res.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("matchUploads", () => {
  const slugs = ["pocari-sweat-yoshiyuki-okuyama", "the-americans-robert-frank"];

  test("pairs an image named after a slug with that book, whatever its extension's case", () => {
    const { bySlug, unknown } = matchUploads(
      ["the-americans-robert-frank.JPG", "pocari-sweat-yoshiyuki-okuyama.webp"],
      slugs,
    );
    expect(bySlug).toEqual({
      "the-americans-robert-frank": "the-americans-robert-frank.JPG",
      "pocari-sweat-yoshiyuki-okuyama": "pocari-sweat-yoshiyuki-okuyama.webp",
    });
    expect(unknown).toEqual([]);
  });

  test("ignores files that aren't images, such as the folder's README", () => {
    expect(matchUploads(["README.md", ".DS_Store"], slugs)).toEqual({ bySlug: {}, unknown: [] });
  });

  test("reports a misnamed image with the closest slug", () => {
    expect(matchUploads(["Pocari Sweat 2018.webp", "holiday.jpg"], slugs).unknown).toEqual([
      { file: "Pocari Sweat 2018.webp", suggestion: "pocari-sweat-yoshiyuki-okuyama" },
      { file: "holiday.jpg", suggestion: undefined },
    ]);
  });

  test("doesn't guess from one-letter words, as in a shop's file name", () => {
    expect(matchUploads(["s-l960.webp"], [...slugs, "china-adagio-andrew-s-t-wong"]).unknown).toEqual([
      { file: "s-l960.webp", suggestion: undefined },
    ]);
  });
});
