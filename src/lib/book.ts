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
  acquired?: string; // when this copy joined the collection: "2024-02-28", "2024-02" or "2024"
}

/** The places books are kept, offered in the header's location menu. */
export const LOCATIONS = ["Brooklyn, NY", "Beijing, China"] as const;

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

/** A date as "2024-02-28", "2024-02" or "2024". */
export const ACQUIRED_DATE =
  /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

/** "2024-02-28" → "February 28, 2024"; "2024-02" → "February 2024"; "2024" stays. */
export function acquiredLabel(acquired?: string): string | undefined {
  if (!acquired || !ACQUIRED_DATE.test(acquired)) return undefined;
  const [year, month, day] = acquired.split("-").map(Number);
  if (!month) return String(year);
  const date = new Date(Date.UTC(year, month - 1, day ?? 1));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    ...(day ? { day: "numeric" } : {}),
  });
}
