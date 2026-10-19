import {
  colorTypeLabel,
  locationOf,
  photographerLine,
  type Book,
} from "./book";
import { coverFor, coverRatio, placeholderTone, versioned } from "./cover";
import { photographerSlug } from "./photographer";
import { url } from "./url";

/** What the book popup shows for one book (see src/components/BookPopup.astro). */
export interface PopupBook {
  href: string;
  title: string;
  year?: number;
  byline: string;
  names: { name: string; href: string }[];
  details: string[]; // publisher, medium
  rows: [string, string][]; // the rest of the wall label, as term and value
  ratio: number;
  cover?: { src: string; large: string };
  tone: { bg: string; fg: string };
}

export function popupData(books: readonly Book[]): Record<string, PopupBook> {
  const data: Record<string, PopupBook> = {};
  for (const book of books) {
    const cover = coverFor(book.slug);
    const rows: [string, string | undefined][] = [
      ["Country or region", book.region],
      ["Genre", book.genre],
      [book.tags.length > 1 ? "Tags" : "Tag", book.tags.join(", ")],
      ["Location", locationOf(book)],
    ];
    data[book.slug] = {
      href: url(`books/${book.slug}`),
      title: book.title,
      year: book.year,
      byline: photographerLine(book),
      names: book.photographers.map((name) => ({
        name,
        href: url(`photographers/${photographerSlug(name)}`),
      })),
      details: [book.publisher, colorTypeLabel(book.colorType)].filter(
        (d): d is string => Boolean(d),
      ),
      rows: rows.filter((row): row is [string, string] => Boolean(row[1])),
      ratio: coverRatio(book.slug),
      cover: cover && {
        src: url(versioned(cover, cover.src)),
        large: url(versioned(cover, cover.large)),
      },
      tone: placeholderTone(book),
    };
  }
  return data;
}
