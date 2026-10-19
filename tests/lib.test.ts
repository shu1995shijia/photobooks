import { describe, expect, test } from "vitest";
import {
  acquiredLabel,
  COLLECTION_LOCATION,
  colorTypeLabel,
  locationOf,
  photographerLine,
  type Book,
} from "../src/lib/book";
import { baseSlug, latinPart, uniqueSlug } from "../src/lib/slug";
import { sortBooks, surname } from "../src/lib/sort";
import { url } from "../src/lib/url";

const book = (over: Partial<Book>): Book => ({
  slug: over.title ?? "x",
  title: "Untitled",
  photographers: [],
  tags: [],
  ...over,
});

describe("latinPart", () => {
  test.each([
    ["China Adagio (漫游中国)", "China Adagio"],
    [
      "Заброшенные города СССР (Abandoned Cities of the USSR)",
      "Abandoned Cities of the USSR",
    ],
    ["生活史 / History of Life", "History of Life"],
    ["Coastline (海岸线)", "Coastline"],
    ["Yoshihiko Ueda（上田義彦）", "Yoshihiko Ueda"],
    ["木村伊兵衛", "木村伊兵衛"],
    ["The Americans", "The Americans"],
  ])("%s → %s", (input, expected) => {
    expect(latinPart(input)).toBe(expected);
  });
});

describe("baseSlug", () => {
  test("joins title and photographer", () => {
    expect(baseSlug("The Americans", "Robert Frank")).toBe(
      "the-americans-robert-frank",
    );
  });

  test("keeps the two 'China' books apart", () => {
    expect(baseSlug("China", "Hiroji Kubota")).not.toBe(
      baseSlug("China", "Yann Layma"),
    );
  });

  test("transliterates titles with no Latin part", () => {
    expect(baseSlug("パリ残像(巴黎残影）", "木村伊兵衛")).toMatch(
      /^[a-z0-9-]+$/,
    );
  });

  test("strips diacritics", () => {
    expect(baseSlug("Parallel Universes of Children", "Uğur Gallenkuş")).toBe(
      "parallel-universes-of-children-ugur-gallenkus",
    );
  });

  test("works without a photographer", () => {
    expect(baseSlug("China: A Photo History")).toBe("china-a-photo-history");
  });

  test("caps the length", () => {
    expect(baseSlug("a ".repeat(100)).length).toBeLessThanOrEqual(80);
  });
});

describe("uniqueSlug", () => {
  test("adds a counter when a slug is taken", () => {
    const taken = new Set<string>();
    expect(uniqueSlug("china", taken)).toBe("china");
    expect(uniqueSlug("china", taken)).toBe("china-2");
    expect(uniqueSlug("china", taken)).toBe("china-3");
  });
});

describe("surname", () => {
  test.each([
    ["Henri Cartier-Bresson", "Cartier-Bresson"],
    ["Jean-Claude Gautrand (ed.)", "Gautrand"],
    ["Andrew S.T. Wong (王身敦)", "Wong"],
    ["木村伊兵衛", "木村伊兵衛"],
  ])("%s → %s", (input, expected) => {
    expect(surname(input)).toBe(expected);
  });
});

describe("sortBooks", () => {
  const frank = book({
    slug: "a",
    title: "The Americans",
    photographers: ["Robert Frank"],
    year: 1959,
  });
  const shore = book({
    slug: "b",
    title: "Songbook",
    photographers: ["Alec Soth"],
    year: 2015,
  });
  const brake = book({
    slug: "c",
    title: "China The 1950s",
    photographers: ["Brian Brake"],
  });
  const anon = book({ slug: "d", title: "Focus", year: 1993 });

  test("by photographer surname, unknown photographer last", () => {
    expect(
      sortBooks([shore, anon, frank, brake], "photographer").map((b) => b.slug),
    ).toEqual(["c", "a", "b", "d"]);
  });

  test("by year, undated last", () => {
    expect(
      sortBooks([shore, brake, frank, anon], "year").map((b) => b.slug),
    ).toEqual(["a", "d", "b", "c"]);
  });

  test("does not mutate the input", () => {
    const input = [shore, frank];
    sortBooks(input, "title");
    expect(input).toEqual([shore, frank]);
  });
});

describe("photographerLine and colorTypeLabel", () => {
  test("joins names for a wall label", () => {
    expect(
      photographerLine(
        book({ photographers: ["Eugène Atget", "Berenice Abbott"] }),
      ),
    ).toBe("Eugène Atget and Berenice Abbott");
    expect(photographerLine(book({}))).toBe("Photographer unknown");
  });

  test("writes colour types in sentence case", () => {
    expect(colorTypeLabel("Black & White")).toBe("Black and white");
    expect(colorTypeLabel("Mixed")).toBe("Color and black and white");
  });
});

describe("url", () => {
  test("adds the base path once", () => {
    expect(url("carousel", "/photobooks")).toBe("/photobooks/carousel");
    expect(url("/carousel", "/photobooks/")).toBe("/photobooks/carousel");
  });
});

describe("locationOf", () => {
  test("is the collection's location unless the book has its own", () => {
    expect(COLLECTION_LOCATION).toBe("Brooklyn, NY");
    expect(locationOf({})).toBe("Brooklyn, NY");
    expect(locationOf({ location: "Shanghai" })).toBe("Shanghai");
  });
});

describe("acquiredLabel", () => {
  test("writes the date out as much as it's known", () => {
    expect(acquiredLabel("2024-02-28")).toBe("February 28, 2024");
    expect(acquiredLabel("2024-02")).toBe("February 2024");
    expect(acquiredLabel("2024")).toBe("2024");
    expect(acquiredLabel(undefined)).toBeUndefined();
    expect(acquiredLabel("someday")).toBeUndefined();
  });
});
