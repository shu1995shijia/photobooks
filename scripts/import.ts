/**
 * Turns the Notion CSV export into src/data/books.json.
 *
 *   npm run import                 (reads data/notion-export.csv)
 *   npm run import -- <path to another export>
 *
 * Only the columns in COLUMNS and OPTIONAL_COLUMNS reach the site; everything else in the export
 * (Purchase Date, Short Description, …) is dropped. Slugs already in
 * books.json are kept, so book URLs don't change on re-import. Books added
 * with `npm run add-book` (data/added-books.json) are merged in after the
 * Notion rows, until the same book turns up in Notion.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { COLOR_TYPES, type Book, type ColorType } from "../src/lib/book";
import { baseSlug, uniqueSlug } from "../src/lib/slug";

const OUTPUT = "src/data/books.json";
const DEFAULT_INPUT = "data/notion-export.csv";
const ADDED = "data/added-books.json";

/** Notion column → what it becomes. The allowlist of public columns. */
const COLUMNS = {
  title: "Name",
  photographers: "Author / Photographer",
  colorType: "Color Type",
  region: "Country / Region",
  genre: "Genre",
  year: "Publish Year",
  publisher: "Publisher",
  tags: "Tags",
} as const;

/** Public columns that may be missing from an export. */
const OPTIONAL_COLUMNS = {
  location: "Location", // where the copy is kept; COLLECTION_LOCATION otherwise
} as const;

type Row = Record<string, string | undefined>;

/** Trims and collapses inner whitespace, including stray newlines from Notion. */
function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function optional(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function list(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

function identity(book: Pick<Book, "title" | "photographers">): string {
  return `${book.title}|${book.photographers.join(";")}`;
}

export interface ImportResult {
  books: Book[];
  warnings: string[];
}

export function parseCatalog(
  csv: string,
  previous: readonly Book[] = [],
): ImportResult {
  const { data, meta } = Papa.parse<Row>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
  });

  const missing = Object.values(COLUMNS).filter(
    (c) => !meta.fields?.includes(c),
  );
  if (missing.length > 0) {
    throw new Error(`The CSV is missing these columns: ${missing.join(", ")}`);
  }

  const warnings: string[] = [];
  const previousSlugs = new Map(previous.map((b) => [identity(b), b.slug]));
  const taken = new Set<string>();
  const books: Book[] = [];

  for (const row of data) {
    const title = clean(row[COLUMNS.title]);
    if (title === "") continue;

    const photographers = list(clean(row[COLUMNS.photographers]), /;/);

    const rawColorType = clean(row[COLUMNS.colorType]);
    const colorType = COLOR_TYPES.find((c) => c === rawColorType) as
      ColorType | undefined;
    if (rawColorType && !colorType) {
      warnings.push(`"${title}": unknown Color Type "${rawColorType}"`);
    }

    const rawYear = clean(row[COLUMNS.year]);
    const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : undefined;
    if (rawYear && year === undefined) {
      warnings.push(`"${title}": Publish Year "${rawYear}" is not a year`);
    }

    const book: Book = {
      slug: "",
      title,
      photographers,
      colorType,
      region: optional(clean(row[COLUMNS.region])),
      genre: optional(clean(row[COLUMNS.genre])),
      year,
      publisher: optional(clean(row[COLUMNS.publisher])),
      tags: list(clean(row[COLUMNS.tags]), /,/),
      location: optional(clean(row[OPTIONAL_COLUMNS.location])),
    };
    books.push(book);
  }

  // Keep earlier slugs first so a new book can never take an existing book's URL.
  for (const book of books) {
    const kept = previousSlugs.get(identity(book));
    if (kept && !taken.has(kept)) {
      book.slug = kept;
      taken.add(kept);
    }
  }
  for (const book of books) {
    if (book.slug === "")
      book.slug = uniqueSlug(
        baseSlug(book.title, book.photographers[0]),
        taken,
      );
  }

  return { books, warnings };
}

/**
 * Appends books added by hand after the Notion ones. A book that Notion now
 * has too (same title and photographers) is left out, with a warning to
 * remove it from data/added-books.json; the others keep their slugs.
 */
export function mergeAdded(
  fromNotion: readonly Book[],
  added: readonly Book[],
): ImportResult {
  const warnings: string[] = [];
  const inNotion = new Set(fromNotion.map(identity));
  const taken = new Set(fromNotion.map((b) => b.slug));
  const books = [...fromNotion];
  for (const book of added) {
    if (inNotion.has(identity(book))) {
      warnings.push(
        `"${book.title}" is in Notion now; remove it from ${ADDED}`,
      );
      continue;
    }
    const slug = taken.has(book.slug)
      ? uniqueSlug(book.slug, taken)
      : book.slug;
    taken.add(slug);
    books.push({ ...book, slug });
  }
  return { books, warnings };
}

function main(): void {
  const input = process.argv[2] ?? DEFAULT_INPUT;
  if (!existsSync(input)) {
    console.error(
      `No export at ${input}. Usage: npm run import -- <path to Notion CSV export>`,
    );
    process.exit(1);
  }

  const previous: Book[] = existsSync(OUTPUT)
    ? JSON.parse(readFileSync(OUTPUT, "utf8"))
    : [];
  const fromNotion = parseCatalog(readFileSync(input, "utf8"), previous);
  const added: Book[] = existsSync(ADDED)
    ? JSON.parse(readFileSync(ADDED, "utf8"))
    : [];
  const merged = mergeAdded(fromNotion.books, added);
  const books = merged.books;
  const warnings = [...fromNotion.warnings, ...merged.warnings];

  writeFileSync(OUTPUT, JSON.stringify(books, null, 2) + "\n");
  for (const w of warnings) console.warn(`Warning: ${w}`);
  console.log(`${books.length} books written to ${OUTPUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
