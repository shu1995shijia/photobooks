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

/** Where the collection is kept. A book's own location, when it has one, wins. */
export const COLLECTION_LOCATION = "New York City, NY";

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
