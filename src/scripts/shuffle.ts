/**
 * The header's Shuffle button: picks a book at random from those on show and
 * opens it, like pulling one off the shelf. By default a highlight flickers
 * across the covers, slows down and settles on one, which then opens (see
 * book-popup.ts). A page can do its own version instead (the carousel spins
 * to the book) with onShuffle().
 */

type Shuffle = () => Promise<void>;
let custom: Shuffle | undefined;

/** Replaces the default flicker with this page's own way of picking a book. */
export function onShuffle(shuffle: Shuffle): void {
  custom = shuffle;
}

const PICKED = "is-shuffle-pick";
/** How many flickers before landing, and how they slow down. */
const STEPS = 14;
const FIRST_MS = 45;
const LAST_MS = 280;
const SETTLE_MS = 420;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The delay before flicker `i` of `steps`: quick at first, easing out. */
export function stepDelay(i: number, steps = STEPS): number {
  const t = steps <= 1 ? 1 : i / (steps - 1);
  return Math.round(FIRST_MS + (LAST_MS - FIRST_MS) * t * t);
}

/** A random index other than `not` (when there's a choice). */
export function randomIndex(length: number, not = -1): number {
  if (length <= 1) return 0;
  let i = not;
  while (i === not) i = Math.floor(Math.random() * length);
  return i;
}

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}

/** The default: flicker across the covers in view, land on a random book, open it. */
async function flicker(): Promise<void> {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>("a[data-popup]"),
  ].filter(
    (a) => a.getClientRects().length > 0, // not hidden by the location menu
  );
  if (links.length === 0) return;
  const target = links[randomIndex(links.length)];
  if (reducedMotion()) {
    target.click();
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  await wait(450);
  const near = links.filter(inView);
  let last = -1;
  for (let i = 0; i < STEPS; i++) {
    const pick =
      i === STEPS - 1 ? target : near[(last = randomIndex(near.length, last))];
    for (const a of links) a.classList.toggle(PICKED, a === pick);
    await wait(stepDelay(i));
  }
  await wait(SETTLE_MS);
  target.classList.remove(PICKED);
  target.click();
}

export function initShuffle(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-shuffle]",
  )) {
    // Only where a book can be opened in place.
    if (!document.querySelector("[data-book-popup]")) continue;
    button.hidden = false;
    let busy = false;
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      button.setAttribute("aria-busy", "true");
      try {
        await (custom ?? flicker)();
      } finally {
        busy = false;
        button.removeAttribute("aria-busy");
      }
    });
  }
}
