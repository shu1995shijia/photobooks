/**
 * The location chosen in the header's menu: only books kept there are shown.
 * null, the default, means every location. The choice lasts while the tab is
 * open (a new visit starts with every location again), and pages that list
 * books follow it through onLocation().
 */

const KEY = "photobooks.location";
const EVENT = "photobooks:location";

export function chosenLocation(known: readonly string[]): string | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    return saved && known.includes(saved) ? saved : null;
  } catch {
    return null; // storage can be blocked; then every location is shown
  }
}

export function chooseLocation(location: string | null): void {
  try {
    if (location) sessionStorage.setItem(KEY, location);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Not remembered, but still applied to this page.
  }
  document.dispatchEvent(new CustomEvent(EVENT, { detail: location }));
}

export function onLocation(listener: (location: string | null) => void): void {
  document.addEventListener(EVENT, (event) =>
    listener((event as CustomEvent<string | null>).detail),
  );
}

/** Whether a book kept at `bookLocation` is shown while `chosen` is selected. */
export function shows(
  chosen: string | null,
  bookLocation: string | undefined,
): boolean {
  return chosen === null || bookLocation === chosen;
}
