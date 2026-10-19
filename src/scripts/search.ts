/**
 * The search typed in the header: only books matching it are shown. Like the
 * location, it lasts while the tab is open, and pages that list books follow
 * it through onSearch().
 */
export { matchesSearch } from "../lib/search";

const KEY = "photobooks.search";
const EVENT = "photobooks:search";

export function currentSearch(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // storage can be blocked; then each page starts unfiltered
  }
}

export function setSearch(query: string): void {
  try {
    if (query) sessionStorage.setItem(KEY, query);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Not remembered, but still applied to this page.
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: query }));
}

export function onSearch(listener: (query: string) => void): void {
  document.addEventListener(EVENT, (event) =>
    listener((event as CustomEvent<string>).detail),
  );
}

/** The message for an empty list: what was searched for, and where. */
export function noneText(query: string, place: string | null): string {
  const where = place ? ` kept in ${place}` : "";
  return query
    ? `No books${where} match “${query}”.`
    : `No books are kept in ${place} yet.`;
}
