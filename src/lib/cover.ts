import type { Book, ColorType } from "./book";
import covers from "../data/covers.json";

/** A downloaded cover, as recorded in src/data/covers.json by `npm run covers`. */
export interface CoverEntry {
  src: string; // "covers/<slug>-600.webp", relative to the site root
  large: string; // "covers/<slug>-1200.webp"
  width: number; // of the 600px version
  height: number;
  dominantColor: string; // "#A34B24", for spines
  source: "openlibrary" | "google" | "override" | "upload";
  origin: string; // where the image came from
  checksum?: string; // of an uploaded file, so a replaced file is noticed
}

export type CoverIndex = Record<string, CoverEntry>;

/** The book's real cover, or undefined when it should get a placeholder. */
export function coverFor(slug: string): CoverEntry | undefined {
  return (covers as CoverIndex)[slug];
}

/**
 * A cover's file path with a version tag, e.g. "covers/x-600.webp?v=3k9f2a".
 * A replaced cover keeps its file name, so the tag changes with the image
 * and browsers don't keep showing the old one from their cache.
 */
export function versioned(entry: CoverEntry, file: string): string {
  const id = [
    entry.origin,
    entry.checksum,
    entry.width,
    entry.height,
    entry.dominantColor,
  ].join("|");
  return `${file}?v=${hash(id).toString(36)}`;
}

/** Placeholder covers are drawn at this width ÷ height. */
const PLACEHOLDER_RATIO = 0.8;

/**
 * A book's cover as width ÷ height, kept within book-like limits (odd shapes
 * are cropped to fit). The placeholder's when there's no cover.
 */
export function coverRatio(slug: string): number {
  const cover = coverFor(slug);
  if (!cover) return PLACEHOLDER_RATIO;
  return Math.min(1.6, Math.max(0.62, cover.width / cover.height));
}

export interface Tone {
  bg: string;
  fg: string;
}

/**
 * Placeholder cover colours until real covers are fetched. Each palette suits
 * its shelf: muted colours for Color, greys for Black & White, two-tone for Mixed.
 * Every pair keeps text contrast at 4.5:1 or better.
 */
const PALETTES: Record<ColorType, Tone[]> = {
  Color: [
    { bg: "#28465C", fg: "#FFFFFF" },
    { bg: "#DCCBA8", fg: "#000000" },
    { bg: "#93362A", fg: "#FFFFFF" },
    { bg: "#355C48", fg: "#FFFFFF" },
    { bg: "#E8C64F", fg: "#000000" },
    { bg: "#4F6383", fg: "#FFFFFF" },
    { bg: "#A34B24", fg: "#FFFFFF" },
    { bg: "#C3D2DE", fg: "#000000" },
  ],
  "Black & White": [
    { bg: "#000000", fg: "#FFFFFF" },
    { bg: "#EDECE8", fg: "#000000" },
    { bg: "#3B3B3B", fg: "#FFFFFF" },
    { bg: "#D5D4CF", fg: "#000000" },
    { bg: "#FAFAF8", fg: "#000000" },
  ],
  Mixed: [
    { bg: "#000000", fg: "#E8C64F" },
    { bg: "#E9E4D8", fg: "#93362A" },
    { bg: "#28465C", fg: "#EDECE8" },
  ],
};

/** A small stable hash, so a book keeps its colour across builds. */
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

export function placeholderTone(book: Pick<Book, "slug" | "colorType">): Tone {
  const palette = PALETTES[book.colorType ?? "Mixed"];
  return palette[hash(book.slug) % palette.length];
}
