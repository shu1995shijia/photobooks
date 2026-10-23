/**
 * Finds, downloads and resizes a cover for each book in src/data/books.json.
 *
 *   npm run covers
 *   npm run covers -- --redo           (re-process covers already found, e.g. after changing the trimming)
 *   npm run covers -- --uploads-only   (only process files in data/covers; no network; used by the deploy)
 *
 * Order: an image uploaded to data/covers/ and named after the book's slug
 * (data/covers/the-americans-robert-frank.jpg), then an entry in
 * data/cover-overrides.json, then Open Library, then Google Books. A search result is used only when its title and photographer both
 * match (see src/lib/match.ts); otherwise the book is listed as a miss and
 * keeps its typographic placeholder. Covers already in src/data/covers.json
 * are skipped, so re-runs only look up what's missing.
 *
 * Overrides map a slug to an image URL, a local file, or an ISBN:
 *   { "the-americans-robert-frank": "9783865215840" }
 *
 * Put GOOGLE_BOOKS_API_KEY=… in .env (gitignored) to use your own Google Books quota; without it,
 * Google often answers "quota exceeded" and only Open Library is used.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Book } from "../src/lib/book";
import type { CoverEntry, CoverIndex } from "../src/lib/cover";
import { rankMatches, type Candidate } from "../src/lib/match";
import { baseSlug, latinPart } from "../src/lib/slug";

const BOOKS = "src/data/books.json";
const INDEX = "src/data/covers.json";
const OVERRIDES = "data/cover-overrides.json";
const UPLOADS = "data/covers";
const IMAGE_TYPES = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".tif",
  ".tiff",
]);
const OUT_DIR = "public/covers";
const WIDTHS = { small: 600, large: 1200 } as const;
/** Smaller images are usually "no cover" placeholders or thumbnails. */
const MIN_WIDTH = 200;
/** Covers narrower than this are reported as low resolution: they're shown up to 600px wide. */
const GOOD_WIDTH = 600;
/** How many close matches per source to try before giving up. */
const MATCHES_TO_TRY = 3;
/** How many editions of a matched work to try for a cover. */
const EDITION_COVERS = 3;
/** Open Library asks for about one request a second and a User-Agent that says who we are. */
const REQUEST_GAP_MS = 1000;
const USER_AGENT =
  "photobooks/0.1 (+https://github.com/shu1995shijia/photobooks)";

export type Fetcher = (url: string) => Promise<Response>;

/** Wraps fetch so requests are at least REQUEST_GAP_MS apart. */
export function throttled(gapMs = REQUEST_GAP_MS): Fetcher {
  let next = 0;
  return async (url) => {
    const wait = next - Date.now();
    next = Math.max(Date.now(), next) + gapMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
  };
}

/**
 * Retries a request the server couldn't handle just then (500, 502, 503, 504),
 * waiting longer each time. Google Books often answers 503 for a moment.
 */
export function withRetries(
  fetcher: Fetcher,
  delaysMs: readonly number[] = [2000, 5000, 10000],
): Fetcher {
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetcher(url);
      if (
        ![500, 502, 503, 504].includes(res.status) ||
        attempt >= delaysMs.length
      )
        return res;
      await new Promise((r) => setTimeout(r, delaysMs[attempt]));
    }
  };
}

/** The title to search with: the romanized part, without parentheses. */
function searchTitle(book: Book): string {
  return latinPart(book.title)
    .replace(/[()（）]/g, " ")
    .trim();
}

/**
 * The first photographer's full name, without "(ed.)" or "Photographs by".
 * A surname alone is too loose: "Frank" also finds Frank Herbert and L. Frank Baum.
 */
export function searchAuthor(book: Book): string | undefined {
  const name = book.photographers[0];
  if (!name) return undefined;
  return latinPart(name)
    .replace(/\(.*?\)/g, "")
    .replace(/^photographs by\s+/i, "")
    .trim();
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
}

export async function searchOpenLibrary(
  book: Book,
  fetcher: Fetcher,
): Promise<Candidate[]> {
  const params = new URLSearchParams({
    title: searchTitle(book),
    fields: "key,title,subtitle,author_name,first_publish_year,cover_i",
    limit: "20",
  });
  const author = searchAuthor(book);
  if (author) params.set("author", author);
  const res = await fetcher(`https://openlibrary.org/search.json?${params}`);
  if (!res.ok) throw new Error(`Open Library answered ${res.status}`);
  const { docs = [] } = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return docs
    .filter((d) => d.title)
    .map((d) => ({
      title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title!,
      authors: d.author_name ?? [],
      year: d.first_publish_year,
      imageUrl: d.cover_i ? openLibraryCover(d.cover_i) : undefined,
      workKey: d.key,
      source: "openlibrary" as const,
    }));
}

function openLibraryCover(id: number): string {
  return `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`;
}

/** Covers of a work's editions, for when the work itself has none (or only a thumbnail). */
export async function editionCovers(
  workKey: string,
  fetcher: Fetcher,
): Promise<string[]> {
  const res = await fetcher(
    `https://openlibrary.org${workKey}/editions.json?limit=50`,
  );
  if (!res.ok) return [];
  const { entries = [] } = (await res.json()) as {
    entries?: { covers?: number[] }[];
  };
  const ids = entries.flatMap((e) => (e.covers ?? []).filter((id) => id > 0));
  return [...new Set(ids)].slice(0, EDITION_COVERS).map(openLibraryCover);
}

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string };
  };
}

/** Thrown when Google Books refuses because the daily quota is used up. */
export class QuotaError extends Error {}

export async function searchGoogle(
  book: Book,
  fetcher: Fetcher,
  apiKey?: string,
): Promise<Candidate[]> {
  let q = `intitle:${searchTitle(book)}`;
  const author = searchAuthor(book);
  if (author) q += ` inauthor:${author}`;
  const params = new URLSearchParams({
    q,
    maxResults: "20",
    printType: "books",
  });
  if (apiKey) params.set("key", apiKey);
  const res = await fetcher(
    `https://www.googleapis.com/books/v1/volumes?${params}`,
  );
  if (res.status === 429) throw new QuotaError("Google Books quota exceeded");
  if (!res.ok) throw new Error(`Google Books answered ${res.status}`);
  const { items = [] } = (await res.json()) as { items?: GoogleVolume[] };
  return items.flatMap(({ volumeInfo: v }) => {
    const thumb = v?.imageLinks?.thumbnail;
    if (!v?.title || !thumb) return [];
    const year = Number.parseInt(v.publishedDate ?? "", 10);
    return [
      {
        title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
        authors: v.authors ?? [],
        year: Number.isNaN(year) ? undefined : year,
        // The thumbnail is tiny; fife=w1200 asks for a larger rendering.
        imageUrl: `${thumb.replace(/^http:/, "https:").replace("&edge=curl", "")}&fife=w1200`,
        source: "google" as const,
      },
    ];
  });
}

export interface Sources {
  openLibrary: (book: Book) => Promise<Candidate[]>;
  google?: (book: Book) => Promise<Candidate[]>;
}

/**
 * Open Library first, then Google Books. Each close match is handed to `use`,
 * best first, until one gives a result (a match's image may turn out too small).
 */
export async function findCover<T>(
  book: Book,
  sources: Sources,
  use: (match: Candidate) => Promise<T | undefined>,
): Promise<T | undefined> {
  for (const search of [sources.openLibrary, sources.google]) {
    if (!search) continue;
    for (const match of rankMatches(book, await search(book)).slice(
      0,
      MATCHES_TO_TRY,
    )) {
      const result = await use(match);
      if (result !== undefined) return result;
    }
  }
  return undefined;
}

/** "9783865215840" or "isbn:978-3-86521-584-0" → the ISBN digits; anything else → undefined. */
export function isbnOf(value: string): string | undefined {
  const digits = value.replace(/^isbn:/i, "").replace(/[\s-]/g, "");
  return /^(\d{9}[\dX]|\d{13})$/i.test(digits) ? digits : undefined;
}

async function loadImage(source: string, fetcher: Fetcher): Promise<Buffer> {
  const isbn = isbnOf(source);
  const location = isbn
    ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
    : source;
  if (!/^https?:\/\//.test(location)) return readFileSync(location);
  const res = await fetcher(location);
  if (!res.ok) throw new Error(`image download answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function hex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** A trim must keep at least this share of each side, or it's cutting into a pale cover. */
const MIN_TRIM_KEEP = 0.75;
/**
 * Uploads are often a product photo: the book on a backdrop, with room around
 * it. They're chosen by hand, so a deeper trim is allowed.
 */
const MIN_TRIM_KEEP_UPLOAD = 0.5;
/** How far (0–255) a pixel may differ from the border colour and still count as border. */
const TRIM_THRESHOLD = 24;

/** A deep trim must stop at an edge: this share of each side's pixels must stand out from the border… */
const MIN_EDGE_CONTRAST = 0.5;
/** …looking this far inside the trimmed image, past the soft edge, and by at least this much (0–255). */
const EDGE_INSET = 0.02;
const EDGE_THRESHOLD = 12;
/** A hairline round the whole image (a scan or screenshot) is shaved off first, up to this wide. */
const OUTLINE_PX = 3;

/**
 * Cuts away a plain border (white, or a studio backdrop) around the cover,
 * judged from the top-left pixel. A white cover on a white background would be
 * trimmed down to its lettering, so a trim that takes more than a quarter of
 * either side is ignored. Uploads may go deeper (MIN_TRIM_KEEP_UPLOAD), but
 * any trim of an upload must stop at the book's edge rather than inside a pale
 * cover: an upload is often the whole cover, with a pale margin of its own.
 */
export async function trimBorder(
  original: Buffer,
  upload = false,
): Promise<Buffer> {
  const image = await shaveOutline(original);
  const { width = 0, height = 0 } = await sharp(image).metadata();
  try {
    const { data, info } = await sharp(image)
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
    const kept = Math.min(info.width / width, info.height / height);
    if (!upload) return kept >= MIN_TRIM_KEEP ? data : original;
    return kept >= MIN_TRIM_KEEP_UPLOAD && (await stopsAtEdge(image, data))
      ? data
      : original;
  } catch {
    return original; // a single-colour image has nothing to trim to
  }
}

/** Cuts off a thin line round the image when the corner differs from just inside it. */
async function shaveOutline(image: Buffer): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  if (width < 100 || height < 100) return image;
  const pixel = (x: number, y: number) =>
    sharp(image)
      .removeAlpha()
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer();
  const [corner, inside] = await Promise.all([
    pixel(0, 0),
    pixel(OUTLINE_PX, OUTLINE_PX),
  ]);
  if (
    Math.max(...[0, 1, 2].map((c) => Math.abs(corner[c] - inside[c]))) <=
    TRIM_THRESHOLD
  )
    return image;
  return sharp(image)
    .extract({
      left: OUTLINE_PX,
      top: OUTLINE_PX,
      width: width - 2 * OUTLINE_PX,
      height: height - 2 * OUTLINE_PX,
    })
    .png()
    .toBuffer();
}

/** Whether every side of the trimmed image is mostly unlike the original's border colour. */
async function stopsAtEdge(
  original: Buffer,
  trimmed: Buffer,
): Promise<boolean> {
  const border = await sharp(original)
    .removeAlpha()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  const { data, info } = await sharp(trimmed)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const stands = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return (
      Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - border[c]))) >
      EDGE_THRESHOLD
    );
  };
  const share = (points: [number, number][]) =>
    points.filter(([x, y]) => stands(x, y)).length / points.length;
  const dx = Math.round(width * EDGE_INSET);
  const dy = Math.round(height * EDGE_INSET);
  const xs = Array.from({ length: width - 2 * dx }, (_, x) => x + dx);
  const ys = Array.from({ length: height - 2 * dy }, (_, y) => y + dy);
  return [
    xs.map((x): [number, number] => [x, dy]),
    xs.map((x): [number, number] => [x, height - 1 - dy]),
    ys.map((y): [number, number] => [dx, y]),
    ys.map((y): [number, number] => [width - 1 - dx, y]),
  ].every((side) => share(side) >= MIN_EDGE_CONTRAST);
}

/** Trims, resizes to WebP in public/covers and returns what the site needs to show it. */
async function saveCover(
  slug: string,
  image: Buffer,
  origin: string,
  source: CoverEntry["source"],
  trim = true,
): Promise<CoverEntry> {
  if (trim) image = await trimBorder(image, source === "upload");
  const { width = 0 } = await sharp(image).metadata();
  if (width < MIN_WIDTH) throw new Error(`image is only ${width}px wide`);
  mkdirSync(OUT_DIR, { recursive: true });

  const sizes = {} as Record<
    keyof typeof WIDTHS,
    { width: number; height: number }
  >;
  for (const [size, max] of Object.entries(WIDTHS) as [
    keyof typeof WIDTHS,
    number,
  ][]) {
    const info = await sharp(image)
      .resize({ width: max, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(`${OUT_DIR}/${slug}-${max}.webp`);
    sizes[size] = { width: info.width, height: info.height };
  }
  const { dominant } = await sharp(image).stats();

  return {
    src: `covers/${slug}-${WIDTHS.small}.webp`,
    large: `covers/${slug}-${WIDTHS.large}.webp`,
    width: sizes.small.width,
    height: sizes.small.height,
    dominantColor: hex(dominant),
    source,
    origin,
  };
}

/** Marks an upload as already cut to the cover's edge. */
const EXACT = /\.exact$/;

/** Whether an upload is used as it is, without trimming its border. */
export function isExact(file: string): boolean {
  return EXACT.test(file.slice(0, -extname(file).length).trim().toLowerCase());
}

export interface Uploads {
  bySlug: Record<string, string>; // slug → file name
  /** Image files whose name isn't a slug, each with the closest slug, if any. */
  unknown: { file: string; suggestion?: string }[];
}

/**
 * Pairs images in data/covers with books by file name: "the-americans-robert-frank.jpg".
 * A name ending in ".exact" ("the-americans-robert-frank.exact.jpg") is the cover
 * exactly as it should look, used without trimming. Other files (this folder's
 * README) are ignored.
 */
export function matchUploads(
  files: readonly string[],
  slugs: readonly string[],
): Uploads {
  const known = new Set(slugs);
  const result: Uploads = { bySlug: {}, unknown: [] };
  for (const file of [...files].sort()) {
    const ext = extname(file).toLowerCase();
    if (!IMAGE_TYPES.has(ext)) continue;
    const name = file
      .slice(0, -ext.length)
      .trim()
      .toLowerCase()
      .replace(EXACT, "");
    if (known.has(name)) result.bySlug[name] = file;
    else result.unknown.push({ file, suggestion: closestSlug(name, slugs) });
  }
  return result;
}

/** The slug sharing the most words with a file name like "Pocari Sweat 2018", if it shares at least half. */
function closestSlug(
  name: string,
  slugs: readonly string[],
): string | undefined {
  // One- and two-letter words (the "s" in eBay's "s-l960.jpg") match too much by chance.
  const words = baseSlug(name)
    .split("-")
    .filter((w) => w.length >= 3);
  if (words.length === 0) return undefined;
  let best: { slug: string; shared: number } | undefined;
  for (const slug of slugs) {
    const own = new Set(slug.split("-"));
    const shared = words.filter((w) => own.has(w)).length;
    if (shared > (best?.shared ?? 0)) best = { slug, shared };
  }
  return best && best.shared * 2 >= words.length ? best.slug : undefined;
}

function checksum(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as T)
    : fallback;
}

async function main(): Promise<void> {
  const books = readJson<Book[]>(BOOKS, []);
  const previous = readJson<CoverIndex>(INDEX, {});
  const overrides = readJson<Record<string, string>>(OVERRIDES, {});
  const fetcher = throttled();
  const googleFetcher = withRetries(fetcher);
  const googleKey = process.env.GOOGLE_BOOKS_API_KEY;
  // --redo re-processes covers already found, from where they came from, without searching again.
  const redo = process.argv.includes("--redo");
  const uploadsOnly = process.argv.includes("--uploads-only");
  const uploads = matchUploads(
    existsSync(UPLOADS) ? readdirSync(UPLOADS) : [],
    books.map((b) => b.slug),
  );
  let googleAvailable = true;

  const sources: Sources = {
    openLibrary: (book) => searchOpenLibrary(book, fetcher),
    google: async (book) => {
      if (!googleAvailable) return [];
      try {
        return await searchGoogle(book, googleFetcher, googleKey);
      } catch (error) {
        if (!(error instanceof QuotaError)) throw error;
        googleAvailable = false;
        console.warn(
          "Google Books quota exceeded; using Open Library only for the rest of this run.",
        );
        return [];
      }
    },
  };

  const index: CoverIndex = {};
  const misses: string[] = [];
  let found = 0;
  let kept = 0;

  for (const [i, book] of books.entries()) {
    const label = `[${i + 1}/${books.length}] ${book.title}`;
    const old = previous[book.slug];
    const override = overrides[book.slug];
    const upload = uploads.bySlug[book.slug];
    const fileExists = old && existsSync(`public/${old.src}`);

    try {
      if (upload) {
        // An uploaded file wins over everything; it's redone when its contents change.
        const path = `${UPLOADS}/${upload}`;
        const data = readFileSync(path);
        const sum = checksum(data);
        if (
          fileExists &&
          old.source === "upload" &&
          old.checksum === sum &&
          !redo
        ) {
          index[book.slug] = old;
          kept++;
          continue;
        }
        index[book.slug] = {
          ...(await saveCover(
            book.slug,
            data,
            path,
            "upload",
            !isExact(upload),
          )),
          checksum: sum,
        };
        console.log(`${label}: uploaded file ${upload}`);
        found++;
        continue;
      }

      if (uploadsOnly) {
        // Keep what's there without searching, unless it came from a file that's since been removed.
        if (fileExists && old.source !== "upload") {
          index[book.slug] = old;
          kept++;
        } else misses.push(book.slug);
        continue;
      }

      if (override) {
        // An override always wins; it's only redone when its value changes.
        if (
          fileExists &&
          old.source === "override" &&
          old.origin === override &&
          !redo
        ) {
          index[book.slug] = old;
          kept++;
          continue;
        }
        index[book.slug] = await saveCover(
          book.slug,
          await loadImage(override, fetcher),
          override,
          "override",
        );
        console.log(`${label}: override`);
        found++;
        continue;
      }

      if (fileExists && old.source !== "override") {
        index[book.slug] = redo
          ? await saveCover(
              book.slug,
              await loadImage(old.origin, fetcher),
              old.origin,
              old.source,
            )
          : old;
        kept++;
        continue;
      }

      const problems: string[] = [];
      const entry = await findCover(book, sources, async (match) => {
        const urls = match.imageUrl ? [match.imageUrl] : [];
        if (match.workKey)
          urls.push(...(await editionCovers(match.workKey, fetcher)));
        for (const imageUrl of new Set(urls)) {
          try {
            const saved = await saveCover(
              book.slug,
              await loadImage(imageUrl, fetcher),
              imageUrl,
              match.source,
            );
            console.log(
              `${label}: ${match.source} (“${match.title}”, ${match.authors.join(", ")})`,
            );
            return saved;
          } catch (error) {
            problems.push((error as Error).message);
          }
        }
        return undefined;
      });
      if (!entry) {
        misses.push(book.slug);
        const why = problems.length
          ? `matched, but ${[...new Set(problems)].join("; ")}`
          : "no match";
        console.log(`${label}: ${why}`);
        continue;
      }
      index[book.slug] = entry;
      found++;
    } catch (error) {
      misses.push(book.slug);
      console.log(`${label}: failed (${(error as Error).message})`);
    }
  }

  const sorted = Object.fromEntries(
    Object.entries(index).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(INDEX, JSON.stringify(sorted, null, 2) + "\n");

  const total = found + kept;
  console.log(
    `\n${total} of ${books.length} books have a cover (${found} new, ${kept} kept); ${misses.length} missed.`,
  );
  if (uploads.unknown.length) {
    console.warn(
      `\nThese files in ${UPLOADS}/ aren't named after a book, so they weren't used:`,
    );
    for (const { file, suggestion } of uploads.unknown)
      console.warn(
        `  ${file}${suggestion ? ` (did you mean ${suggestion}${extname(file)}?)` : ""}`,
      );
  }
  if (misses.length && !uploadsOnly) {
    console.log(
      `Upload a cover to ${UPLOADS}/<slug>.jpg, or add one to ${OVERRIDES} as an image URL or an ISBN:`,
    );
    for (const slug of misses) console.log(`  ${slug}`);
  }

  // The large file is the source image capped at 1200px, so its width shows the source's.
  const lowRes: string[] = [];
  for (const [slug, entry] of Object.entries(sorted)) {
    const { width = 0 } = await sharp(`public/${entry.large}`).metadata();
    if (width < GOOD_WIDTH) lowRes.push(`  ${slug} (${width}px wide)`);
  }
  if (lowRes.length) {
    console.log(
      `\nThese covers are under ${GOOD_WIDTH}px wide and may look soft; a larger image in ${UPLOADS}/ would help:`,
    );
    for (const line of lowRes) console.log(line);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
