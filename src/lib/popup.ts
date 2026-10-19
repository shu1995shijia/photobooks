import {
  acquiredLabel,
  colorTypeLabel,
  locationOf,
  photographerLine,
  type Book,
} from "./book";
import { coverFor, coverRatio, placeholderTone, versioned } from "./cover";
import { photographerSlug } from "./photographer";
import { tagSlug } from "./tag";
import { url } from "./url";

export interface PopupLink {
  name: string;
  href: string;
}

/** What the book popup shows for one book (see src/components/BookPopup.astro). */
export interface PopupBook {
  href: string;
  title: string;
  year?: number;
  byline: string;
  names: PopupLink[];
  details: string[]; // publisher, medium
  rows: [string, string | PopupLink[]][]; // the rest of the wall label, as term and value (or links)
  ratio: number;
  cover?: { src: string; large: string };
  tone: { bg: string; fg: string };
}

export function popupData(books: readonly Book[]): Record<string, PopupBook> {
  const data: Record<string, PopupBook> = {};
  for (const book of books) {
    const cover = coverFor(book.slug);
    const tags = book.tags.map((name) => ({
      name,
      href: url(`tags/${tagSlug(name)}`),
    }));
    const rows: [string, string | PopupLink[] | undefined][] = [
      ["Country or region", book.region],
      ["Genre", book.genre],
      [tags.length > 1 ? "Tags" : "Tag", tags.length ? tags : undefined],
      ["Location", locationOf(book)],
      ["In the collection since", acquiredLabel(book.acquired)],
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
      rows: rows.filter((row): row is [string, string | PopupLink[]] =>
        Boolean(row[1]),
      ),
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
