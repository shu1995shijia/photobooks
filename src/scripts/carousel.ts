/**
 * The carousel, as Cover Flow: the current book faces you and the others stand
 * angled on either side. Moves with the Previous/Next buttons, ←/→ (Home/End),
 * dragging or swiping (several books per drag), sideways trackpad scrolling,
 * or a click on any book at the side. The current book is kept in the URL
 * hash (#slug), so a reload or a shared link opens the same book. Clicking
 * the book at the front opens its detail page. Only books kept at the
 * location chosen in the header are shown.
 */

import { chosenLocation, onLocation, shows } from "./location";
import { onPick, onReorder, randomIndex, shuffled } from "./shuffle";

export function wrap(index: number, total: number): number {
  return ((index % total) + total) % total;
}

/** How far book `i` is from the current one, the short way round: -1 is just to the left. */
export function offset(i: number, index: number, total: number): number {
  const d = wrap(i - index, total);
  return d > total / 2 ? d - total : d;
}

/** Books shown on each side. A couple more are laid out invisibly, so their covers load early. */
export const VISIBLE = 6;
const PRELOAD = 2;

export type Position = "current" | "side" | "edge";

export function position(d: number): Position | undefined {
  const abs = Math.abs(d);
  if (abs === 0) return "current";
  if (abs <= VISIBLE) return "side";
  if (abs <= VISIBLE + PRELOAD) return "edge";
  return undefined;
}

/** How long the Shuffle spin takes, and the least number of books it passes. */
const SPIN_MS = 2600;
const MIN_SPIN = 8;

/**
 * The pauses between the books a spin passes: short at first, then longer,
 * like a wheel slowing down, adding up to `totalMs`.
 */
export function spinDelays(steps: number, totalMs = SPIN_MS): number[] {
  const weights = Array.from({ length: steps }, (_, i) => {
    const t = steps <= 1 ? 1 : i / (steps - 1);
    return 0.2 + t * t;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (totalMs * w) / sum);
}

/** Drag distance that moves one book, as a share of the stage width. */
const DRAG_STEP = 1 / 18;
const MIN_DRAG_STEP = 36;
/** Movement smaller than this is a click, not a drag. */
const CLICK_SLOP = 6;
const ANNOUNCE_DELAY_MS = 400;

export function initCarousel(root: HTMLElement): void {
  const allSlides = [...root.querySelectorAll<HTMLElement>(".slide")];
  const allTicks = [...root.querySelectorAll<HTMLElement>("[data-tick]")];
  const counter = root.querySelector<HTMLElement>("[data-counter]")!;
  const live = root.querySelector<HTMLElement>("[data-live]")!;
  const stage = root.querySelector<HTMLElement>("[data-stage]")!;
  const controls = root.querySelector<HTMLElement>("[data-controls]")!;
  const empty = root.querySelector<HTMLElement>("[data-empty]")!;
  if (allSlides.length === 0) return;
  const places: string[] = JSON.parse(root.dataset.locations ?? "[]");

  // The books shown for the chosen location, and their ticks.
  let slides = allSlides;
  let ticks = allTicks;
  let slugs = slides.map((s) => s.dataset.slug!);
  let total = slides.length;

  const indexFromHash = (): number => {
    const slug = decodeURIComponent(location.hash.slice(1));
    return Math.max(0, slugs.indexOf(slug));
  };

  let index = indexFromHash();
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  let place: string | null = null;

  /** Shows only the books kept at `chosen` (all when null), staying on the current book if it's among them. */
  function filter(chosen: string | null): void {
    place = chosen;
    const current = slugs[index];
    const keep = allSlides.map((s) => shows(place, s.dataset.location));
    slides = allSlides.filter((_, i) => keep[i]);
    ticks = allTicks.filter((_, i) => keep[i]);
    allSlides.forEach((slide, i) => {
      if (keep[i]) return;
      delete slide.dataset.pos;
      slide.setAttribute("aria-hidden", "true");
    });
    allTicks.forEach((tick, i) => (tick.hidden = !keep[i]));
    slugs = slides.map((s) => s.dataset.slug!);
    total = slides.length;
    index = Math.max(0, slugs.indexOf(current));

    const none = total === 0;
    stage.hidden = none;
    controls.hidden = none;
    empty.hidden = !none;
    if (none) empty.textContent = `No books are kept in ${place} yet.`;
    else render(false);
  }

  function render(announce: boolean): void {
    if (total === 0) return;
    slides.forEach((slide, i) => {
      const d = offset(i, index, total);
      const pos = position(d);
      if (pos) slide.dataset.pos = pos;
      else delete slide.dataset.pos;
      slide.style.setProperty("--d", String(d));
      slide.style.setProperty("--abs", String(Math.abs(d)));
      slide.style.setProperty("--side", String(Math.sign(d)));
      slide.style.zIndex = String(total - Math.abs(d));
      slide.toggleAttribute("aria-hidden", pos !== "current");
      slide.setAttribute("aria-label", `${i + 1} of ${total}`);
      // Only the book at the front can be tabbed to.
      slide
        .querySelector("a")
        ?.setAttribute("tabindex", pos === "current" ? "0" : "-1");
    });
    ticks.forEach((tick, i) =>
      tick.toggleAttribute("data-current", i === index),
    );
    counter.textContent = `${index + 1} of ${total}`;
    history.replaceState(null, "", `#${slugs[index]}`);
    if (announce) {
      // Wait until a drag or a run of key presses settles, so a screen reader hears one book.
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        live.textContent = `${index + 1} of ${total}: ${slides[index].dataset.announce ?? ""}`;
      }, ANNOUNCE_DELAY_MS);
    }
  }

  function go(next: number): void {
    if (total === 0) return;
    next = wrap(next, total);
    if (next === index) return;
    index = next;
    render(true);
  }

  root
    .querySelector("[data-prev]")!
    .addEventListener("click", () => go(index - 1));
  root
    .querySelector("[data-next]")!
    .addEventListener("click", () => go(index + 1));

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    // A book open over the carousel has the keys.
    if (document.querySelector("dialog[open]")) return;
    const focused = event.target;
    if (
      focused instanceof Element &&
      focused.closest("input, select, textarea, [contenteditable]")
    )
      return;
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: total - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      go(moves[event.key]);
    }
    // Enter opens the book at the front, unless a link or button has focus and takes it.
    if (
      event.key === "Enter" &&
      total > 0 &&
      !(focused instanceof Element && focused.closest("a, button, summary"))
    ) {
      event.preventDefault();
      slides[index].querySelector<HTMLAnchorElement>("a[data-popup]")?.click();
    }
  });

  // Dragging scrubs through the books: one book per step of distance.
  let drag: { x: number; y: number; from: number; moved: boolean } | null =
    null;
  const dragStep = () => Math.max(MIN_DRAG_STEP, stage.clientWidth * DRAG_STEP);

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, from: index, moved: false };
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      // A mostly vertical movement is the page scrolling, not a drag.
      if (
        Math.abs(dx) < CLICK_SLOP ||
        Math.abs(dx) < Math.abs(event.clientY - drag.y)
      )
        return;
      drag.moved = true;
      stage.setPointerCapture(event.pointerId);
    }
    go(drag.from - Math.round(dx / dragStep()));
  });
  const endDrag = () => {
    // Leave `moved` readable for the click that follows a drag.
    setTimeout(() => (drag = null));
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", () => (drag = null));

  // A click on a book at the side brings it to the front instead of opening it.
  stage.addEventListener("click", (event) => {
    const slide = (event.target as Element).closest<HTMLElement>(".slide");
    if (drag?.moved || slide?.dataset.pos !== "current") event.preventDefault();
    if (drag?.moved) return;
    if (slide?.dataset.pos === "side") go(slides.indexOf(slide));
  });

  // Sideways trackpad scrolling; vertical scrolling is left to the page.
  let wheel = 0;
  stage.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      wheel += event.deltaX;
      const steps = Math.trunc(wheel / dragStep());
      if (steps !== 0) {
        wheel -= steps * dragStep();
        go(index + steps);
      }
    },
    { passive: false },
  );

  window.addEventListener("hashchange", () => go(indexFromHash()));

  // Shuffle: every book but the one in front moves to a random place, and
  // the books on either side glide to their new positions. Only the order
  // the carousel uses changes; the elements stay put (moving them would
  // restart them, so they'd fade in rather than glide).
  onReorder(() => {
    if (total === 0) return;
    const order = shuffled(allSlides.map((_, i) => i));
    const newSlides = order.map((i) => allSlides[i]);
    const newTicks = order.map((i) => allTicks[i]);
    allSlides.splice(0, allSlides.length, ...newSlides);
    allTicks.splice(0, allTicks.length, ...newTicks);
    // The ticks are plain marks, so they can move: the red dot keeps showing where you are.
    allTicks[0]?.parentElement?.append(...newTicks);
    filter(place); // recounts, staying on the book in front
  });

  // Pick for me: spin forward to a random book, slowing down, then open it.
  onPick(async () => {
    if (total === 0) return;
    const target = randomIndex(total, index);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      go(target);
    } else {
      let steps = wrap(target - index, total);
      if (steps < MIN_SPIN) steps += total; // a short hop doesn't feel like a spin
      // Follow the clock rather than counting on each step's pause: when
      // drawing a frame takes longer, books are skipped, not time added.
      const at = spinDelays(steps).map((_, i, all) =>
        all.slice(0, i + 1).reduce((a, b) => a + b, 0),
      );
      const start = index;
      const began = performance.now();
      let done = 0;
      while (done < steps) {
        await new Promise(requestAnimationFrame);
        const elapsed = performance.now() - began;
        let due = done;
        while (due < steps && at[due] - at[0] <= elapsed) due++;
        if (due > done) {
          done = due;
          go(start + done);
        }
      }
      await new Promise((r) => setTimeout(r, 450)); // let the last book settle
    }
    slides[index].querySelector<HTMLAnchorElement>("a[data-popup]")?.click();
  });

  root.classList.add("is-enhanced");
  controls.hidden = false;
  onLocation(filter);
  filter(chosenLocation(places));
}
