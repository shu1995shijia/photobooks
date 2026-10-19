/**
 * The header's two chance buttons.
 *
 * Shuffle puts the covers in a random order, each one gliding to its new
 * place. By default it reorders every [data-shuffle-list]; the carousel does
 * its own with onReorder(). A reload brings back the usual order.
 *
 * Pick for me chooses a book at random from those on show and opens it, like
 * pulling one off the shelf: a highlight flickers across the covers, slows
 * down and settles on one, which then opens (see book-popup.ts). The
 * carousel spins to the book instead, with onPick().
 */

type Action = () => Promise<void> | void;
let customPick: Action | undefined;
let customReorder: Action | undefined;

/** Replaces the default flicker with this page's own way of picking a book. */
export function onPick(pick: Action): void {
  customPick = pick;
}

/** Replaces the default reordering of [data-shuffle-list] with this page's own. */
export function onReorder(reorder: Action): void {
  customReorder = reorder;
}

const PICKED = "is-shuffle-pick";
/** How many flickers before landing, and how they slow down. */
const STEPS = 14;
const FIRST_MS = 45;
const LAST_MS = 280;
const SETTLE_MS = 420;
/** How long a cover takes to glide to its new place (plus a little each, so they don't move as one). */
const MOVE_MS = 620;
const MOVE_SPREAD_MS = 260;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

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

/** A copy of `items` in random order (Fisher–Yates). */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}

/** The default pick: flicker across the covers in view, land on a random book, open it. */
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

/**
 * The default shuffle: puts each [data-shuffle-list]'s items in a random
 * order, then slides every visible one from where it was to where it is now.
 */
async function reorderLists(): Promise<void> {
  const moves: Promise<unknown>[] = [];
  for (const list of document.querySelectorAll<HTMLElement>(
    "[data-shuffle-list]",
  )) {
    const items = [...list.children] as HTMLElement[];
    const before = new Map(items.map((i) => [i, i.getBoundingClientRect()]));
    list.append(...shuffled(items));
    if (reducedMotion()) continue;
    for (const item of items) {
      const a = before.get(item)!;
      const b = item.getBoundingClientRect();
      if (!a.width || !b.width) continue; // hidden by the location menu
      const from = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
      moves.push(
        item.animate(
          [
            { transform: from, transformOrigin: "top left", zIndex: 1 },
            { transform: "none", transformOrigin: "top left", zIndex: 1 },
          ],
          { duration: MOVE_MS + Math.random() * MOVE_SPREAD_MS, easing: EASE },
        ).finished,
      );
    }
  }
  await Promise.all(moves);
}

function wire(
  selector: string,
  available: () => boolean,
  action: () => Promise<void> | void,
): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(selector)) {
    if (!available()) continue;
    button.hidden = false;
    let busy = false;
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      button.setAttribute("aria-busy", "true");
      try {
        await action();
      } finally {
        busy = false;
        button.removeAttribute("aria-busy");
      }
    });
  }
}

export function initShuffle(): void {
  // Each button only appears where it can do something.
  wire(
    "[data-shuffle]",
    () => !!document.querySelector("[data-shuffle-list], [data-carousel]"),
    () => (customReorder ?? reorderLists)(),
  );
  wire(
    "[data-pick]",
    () => !!document.querySelector("[data-book-popup]"),
    () => (customPick ?? flicker)(),
  );
}
