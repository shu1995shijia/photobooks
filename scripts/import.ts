/**
 * Turns the Notion CSV export into src/data/books.json.
 *
 *   npm run import -- data/notion-export.csv
 *
 * Only the columns in COLUMNS and OPTIONAL_COLUMNS reach the site; everything else in the export
 * (Purchase Date, Short Description, …) is dropped. Slugs already in
 * books.json are kept, so book URLs don't change on re-import.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { COLOR_TYPES, type Book, type ColorType } from "../src/lib/book";
import { baseSlug, uniqueSlug } from "../src/lib/slug";

const OUTPUT = "src/data/books.json";

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

function main(): void {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run import -- <path to Notion CSV export>");
    process.exit(1);
  }

  const previous: Book[] = existsSync(OUTPUT)
    ? JSON.parse(readFileSync(OUTPUT, "utf8"))
    : [];
  const { books, warnings } = parseCatalog(
    readFileSync(input, "utf8"),
    previous,
  );

  writeFileSync(OUTPUT, JSON.stringify(books, null, 2) + "\n");
  for (const w of warnings) console.warn(`Warning: ${w}`);
  console.log(`${books.length} books written to ${OUTPUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
