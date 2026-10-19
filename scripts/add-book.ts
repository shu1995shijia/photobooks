/**
 * Adds a book that isn't in the Notion export yet.
 *
 *   npm run add-book -- '{"title": "Songbook", "photographers": ["Alec Soth"], ...}'
 *   npm run add-book -- path/to/book.json
 *
 * The book goes into data/added-books.json, which `npm run import` merges
 * after the Notion rows, so it survives re-imports, and straight into
 * src/data/books.json so the site has it now. Once the same book (same title
 * and photographers) is in Notion, the importer uses the Notion row and says
 * the entry in added-books.json can go. Prints the new book's slug.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COLOR_TYPES, type Book } from "../src/lib/book";
import { baseSlug, uniqueSlug } from "../src/lib/slug";

export const ADDED = "data/added-books.json";
const BOOKS = "src/data/books.json";

const FIELDS = [
  "title",
  "photographers",
  "colorType",
  "region",
  "genre",
  "year",
  "publisher",
  "tags",
  "location",
];

/** Checks and tidies a book from the command line; throws on anything the site can't show. */
export function validate(input: unknown): Omit<Book, "slug"> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("expected a JSON object");
  const raw = input as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((k) => !FIELDS.includes(k));
  if (unknown.length)
    throw new Error(
      `unknown fields: ${unknown.join(", ")} (allowed: ${FIELDS.join(", ")})`,
    );

  const text = (key: string): string | undefined => {
    const v = raw[key];
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string") throw new Error(`${key} must be text`);
    return v.replace(/\s+/g, " ").trim() || undefined;
  };
  const texts = (key: string): string[] => {
    const v = raw[key] ?? [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
      throw new Error(`${key} must be a list of text`);
    return (v as string[]).map((x) => x.trim()).filter(Boolean);
  };

  const title = text("title");
  if (!title) throw new Error("title is required");
  const colorType = text("colorType");
  if (colorType && !COLOR_TYPES.includes(colorType as never))
    throw new Error(`colorType must be one of: ${COLOR_TYPES.join(", ")}`);
  const year = raw.year;
  if (
    year !== undefined &&
    year !== null &&
    !(
      Number.isInteger(year) &&
      (year as number) >= 1800 &&
      (year as number) <= 2100
    )
  )
    throw new Error("year must be a four-digit number");

  const book: Omit<Book, "slug"> = {
    title,
    photographers: texts("photographers"),
    colorType: colorType as Book["colorType"],
    region: text("region"),
    genre: text("genre"),
    year: (year ?? undefined) as number | undefined,
    publisher: text("publisher"),
    tags: texts("tags"),
    location: text("location"),
  };
  // Leave out empty fields, as the importer does.
  return Object.fromEntries(
    Object.entries(book).filter(([, v]) => v !== undefined),
  ) as Omit<Book, "slug">;
}

const identity = (b: Pick<Book, "title" | "photographers">) =>
  `${b.title.toLowerCase()}|${b.photographers.map((p) => p.toLowerCase()).join(";")}`;

/** Gives `book` a slug that no book in `catalog` has; refuses a book that's already there. */
export function addTo(
  catalog: readonly Book[],
  book: Omit<Book, "slug">,
): Book {
  const twin = catalog.find((b) => identity(b) === identity(book));
  if (twin) throw new Error(`already in the catalog as ${twin.slug}`);
  const slug = uniqueSlug(
    baseSlug(book.title, book.photographers[0]),
    new Set(catalog.map((b) => b.slug)),
  );
  return { slug, ...book };
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as T)
    : fallback;
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      `Usage: npm run add-book -- '<book as JSON>'   (or a path to a .json file)`,
    );
    process.exit(1);
  }
  const input = JSON.parse(existsSync(arg) ? readFileSync(arg, "utf8") : arg);
  const books = readJson<Book[]>(BOOKS, []);
  const added = readJson<Book[]>(ADDED, []);

  const book = addTo(books, validate(input));
  writeFileSync(ADDED, JSON.stringify([...added, book], null, 2) + "\n");
  writeFileSync(BOOKS, JSON.stringify([...books, book], null, 2) + "\n");
  console.log(book.slug);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Not added: ${(error as Error).message}`);
    process.exit(1);
  }
}
