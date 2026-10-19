/**
 * Opens a book over the page, like opening the book itself: the cover glides
 * from where it was clicked to the middle of the screen, then its page swings
 * open beside it (below it on a phone). The address changes to the book's own
 * page, so a reload or a shared link still works, and Back closes it. Esc, ←,
 * the Close button or a click outside close it too, in reverse.
 */
import type { PopupBook, PopupLink } from "../lib/popup";

const OPEN_MS = 450;
const PAGE_MS = 650;
const CLOSE_MS = 320;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** The page's width beside the cover, and the most of the screen the book may take. */
const PAGE_W = 380;
const MAX_H = 640;
/** On a phone: the page's widest, the popup's padding above and below, and the smallest the cover may shrink to. */
const PHONE_PAGE_W = 440;
const PHONE_PAD = 64 + 24;
const PHONE_MIN_COVER = 0.3;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "A, B": each one a link. */
function links(list: PopupLink[]): DocumentFragment {
  const out = document.createDocumentFragment();
  list.forEach(({ name, href }, i) => {
    if (i > 0) out.append(", ");
    const a = el("a", undefined, name);
    a.href = href;
    out.append(a);
  });
  return out;
}

/** The wall label: names (linked), title and year, publisher and medium, then the rest. */
function label(book: PopupBook): DocumentFragment {
  const out = document.createDocumentFragment();
  const name = el("p", "name");
  if (book.names.length === 0) name.textContent = book.byline;
  book.names.forEach(({ name: n, href }, i) => {
    if (i > 0) name.append(i === book.names.length - 1 ? " and " : ", ");
    const a = el("a", undefined, n);
    a.href = href;
    name.append(a);
  });
  const title = el("p", "title");
  title.append(
    el("em", undefined, book.title),
    book.year ? `, ${book.year}` : "",
  );
  out.append(name, title, ...book.details.map((d) => el("p", "detail", d)));
  if (book.rows.length) {
    const dl = el("dl");
    for (const [term, value] of book.rows) {
      const row = el("div");
      const dd = el("dd");
      dd.append(typeof value === "string" ? value : links(value));
      row.append(el("dt", undefined, term), dd);
      dl.append(row);
    }
    out.append(dl);
  }
  return out;
}

function coverImage(book: PopupBook): HTMLElement {
  if (book.cover) {
    const img = el("img");
    img.src = book.cover.large;
    img.alt = `Cover of ${book.title}`;
    return img;
  }
  const box = el("div", "spread-placeholder");
  box.style.setProperty("--cover-bg", book.tone.bg);
  box.style.setProperty("--cover-fg", book.tone.fg);
  box.append(
    el("span", undefined, book.byline),
    el("span", undefined, book.title),
  );
  return box;
}

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => matchMedia("(max-width: 720px)").matches;

/** Where `node` is on screen, if it's still there and visible. */
function onScreen(node: Element | null): DOMRect | undefined {
  if (!node || !node.isConnected) return undefined;
  const r = node.getBoundingClientRect();
  const visible =
    r.width > 0 &&
    r.bottom > 0 &&
    r.top < innerHeight &&
    r.right > 0 &&
    r.left < innerWidth;
  return visible ? r : undefined;
}

export function initBookPopup(): void {
  const found = document.querySelector<HTMLDialogElement>("[data-book-popup]");
  const source = document.getElementById("book-popup-data");
  if (!found || !source) return;
  const dialog: HTMLDialogElement = found;
  const books: Record<string, PopupBook> = JSON.parse(
    source.textContent ?? "{}",
  );
  const spread = dialog.querySelector<HTMLElement>("[data-spread]")!;
  const cover = dialog.querySelector<HTMLElement>("[data-spread-cover]")!;
  const page = dialog.querySelector<HTMLElement>("[data-spread-page]")!;
  const text = dialog.querySelector<HTMLElement>("[data-spread-label]")!;
  const closeButton = dialog.querySelector<HTMLButtonElement>(
    "[data-spread-close]",
  )!;

  let from: Element | null = null; // the cover that was clicked, to fly back to
  let pushed = false; // whether the open book has its own history entry
  let closing = false;

  const closedPage = () => (narrow() ? "rotateX(180deg)" : "rotateY(-180deg)");

  /** Needs the dialog open, since on a phone it measures the page. */
  function size(book: PopupBook): void {
    spread.style.setProperty("--ratio", String(book.ratio));
    if (narrow()) {
      // The page keeps a readable width; the cover gets the height it leaves.
      const pageW = Math.min(innerWidth * 0.86, PHONE_PAGE_W);
      spread.style.setProperty("--page-w", `${Math.round(pageW)}px`);
      const coverH = Math.min(
        pageW / book.ratio,
        Math.max(
          innerHeight * PHONE_MIN_COVER,
          innerHeight - PHONE_PAD - page.offsetHeight,
        ),
      );
      spread.style.setProperty("--w", `${Math.round(coverH * book.ratio)}px`);
    } else {
      const pageW = Math.min(PAGE_W, innerWidth * 0.4);
      const h = Math.min(
        innerHeight * 0.82,
        MAX_H,
        (innerWidth * 0.92 - pageW) / book.ratio,
      );
      spread.style.setProperty("--h", `${Math.round(h)}px`);
      spread.style.setProperty("--page-w", `${Math.round(pageW)}px`);
    }
  }

  /** The transform that puts the popup's cover over `rect`. */
  function over(rect: DOMRect): string {
    const to = cover.getBoundingClientRect();
    return `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`;
  }

  function open(slug: string, clicked: Element | null, push: boolean): void {
    const book = books[slug];
    if (!book) return;
    from = clicked;
    cover.replaceChildren(coverImage(book));
    text.replaceChildren(label(book));
    dialog.setAttribute("aria-label", `${book.title}, ${book.byline}`);
    dialog.showModal();
    size(book);
    dialog.scrollTop = 0;
    closeButton.focus();
    if (push) {
      history.pushState({ bookPopup: slug }, "", book.href);
      pushed = true;
    }
    if (reducedMotion()) return;

    dialog.animate(
      { opacity: [0, 1] },
      { duration: 250, pseudoElement: "::backdrop" },
    );
    const start = onScreen(clicked);
    cover.animate(
      start
        ? [
            { transform: over(start), transformOrigin: "top left" },
            { transform: "none", transformOrigin: "top left" },
          ]
        : [
            { opacity: 0, transform: "scale(0.94)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: OPEN_MS, easing: EASE },
    );
    page.animate([{ transform: closedPage() }, { transform: "none" }], {
      duration: PAGE_MS,
      delay: OPEN_MS * 0.55,
      easing: EASE,
      fill: "backwards",
    });
  }

  async function close(fromHistory: boolean): Promise<void> {
    if (!dialog.open || closing) return;
    closing = true;
    if (!fromHistory && pushed) {
      pushed = false;
      history.back(); // its popstate arrives while `closing`, so it's ignored
    }
    pushed = false;
    if (!reducedMotion()) {
      await page.animate([{ transform: "none" }, { transform: closedPage() }], {
        duration: CLOSE_MS,
        easing: "ease-in",
        fill: "forwards",
      }).finished;
      const end = onScreen(from);
      dialog.animate(
        { opacity: [1, 0] },
        { duration: CLOSE_MS, pseudoElement: "::backdrop", fill: "forwards" },
      );
      await cover.animate(
        end
          ? [
              { transform: "none", transformOrigin: "top left" },
              { transform: over(end), transformOrigin: "top left" },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration: CLOSE_MS, easing: EASE, fill: "forwards" },
      ).finished;
    }
    dialog.close();
    for (const node of [cover, page])
      node.getAnimations().forEach((a) => a.cancel());
    dialog.getAnimations({ subtree: false }).forEach((a) => a.cancel());
    if (from instanceof HTMLElement) from.focus({ preventScroll: true });
    closing = false;
  }

  // Any link to a book marked data-popup opens it here; a modified click still opens the page.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-popup]",
    );
    if (!link) return;
    const slug = link.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!books[slug]) return;
    event.preventDefault();
    open(slug, link.querySelector(".cover") ?? link, true);
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault(); // Esc: close with the animation
    void close(false);
  });
  dialog.addEventListener("keydown", (event) => {
    if (
      event.key === "ArrowLeft" &&
      !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    ) {
      event.preventDefault();
      void close(false);
    }
  });
  // A click on the dimmed page around the book.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) void close(false);
  });
  closeButton.addEventListener("click", () => void close(false));

  window.addEventListener("popstate", (event) => {
    const slug = (event.state as { bookPopup?: string } | null)?.bookPopup;
    if (dialog.open) void close(true);
    else if (slug && books[slug]) {
      // Forward again to an open book.
      open(slug, null, false);
      pushed = true;
    }
  });
}
