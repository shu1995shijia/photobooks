export const COLOR_TYPES = ["Color", "Black & White", "Mixed"] as const;
export type ColorType = (typeof COLOR_TYPES)[number];

export interface Book {
  slug: string; // "the-americans-robert-frank"
  title: string;
  photographers: string[]; // split on ";"; empty when unknown
  colorType?: ColorType;
  region?: string;
  genre?: string;
  year?: number;
  publisher?: string;
  tags: string[];
  location?: string; // where this copy is kept, when it isn't COLLECTION_LOCATION
}

/** The places books are kept, offered in the header's location menu. */
export const LOCATIONS = ["New York City, NY", "Beijing, China"] as const;

/** Where a book is kept unless it says otherwise. */
export const COLLECTION_LOCATION: string = LOCATIONS[0];

export function locationOf(book: Pick<Book, "location">): string {
  return book.location ?? COLLECTION_LOCATION;
}

/** "Robert Frank" or "Atget and Abbott"; "Photographer unknown" when empty. */
export function photographerLine(book: Book): string {
  const names = book.photographers;
  if (names.length === 0) return "Photographer unknown";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The museum-label line for medium: "Black and white", "Color", "Color and black and white". */
export function colorTypeLabel(colorType?: ColorType): string | undefined {
  switch (colorType) {
    case "Black & White":
      return "Black and white";
    case "Mixed":
      return "Color and black and white";
    default:
      return colorType;
  }
}
