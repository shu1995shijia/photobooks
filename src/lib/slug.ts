import { slugify as transliterate } from "transliteration";

const LATIN = /[A-Za-z]/;

/**
 * Prefers the romanized part of a mixed-script name, so
 * "China Adagio (漫游中国)" → "China Adagio" and
 * "Заброшенные города СССР (Abandoned Cities of the USSR)" → "Abandoned Cities of the USSR".
 * Names with no Latin part are returned whole and transliterated later.
 */
export function latinPart(name: string): string {
  const parts = name
    .split(/[()（）]|\s\/\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.find((p) => LATIN.test(p)) ?? name;
}

const MAX_LENGTH = 80;

export function baseSlug(title: string, photographer?: string): string {
  const source = [latinPart(title), photographer ? latinPart(photographer) : ""]
    .filter(Boolean)
    .join(" ");
  const slug = transliterate(source, { lowercase: true, separator: "-" })
    .replace(/[^a-z0-9]+/g, "-") // transliterate() leaves "." and similar in place
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, MAX_LENGTH).replace(/-+$/, "") || "book";
}

/** Returns `base`, or `base-2`, `base-3`… if it is already taken. Records the result in `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}
