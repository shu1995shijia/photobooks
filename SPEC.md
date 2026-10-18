# Spec: Photobooks

## Objective

A public website that shows my collection of photobooks (under 100 books), so that I, and anyone I share the link with, can browse it the way you'd browse a real shelf.

The data comes from my Notion catalog, exported as CSV. Cover images aren't in Notion; they're looked up online.

### The data (from the real export, 2026-10-18)

The input is `the Library …_all.csv`: 71 books plus 1 blank row. The columns are:

| Notion column | Filled | Public? | Use on site |
|---|---|---|---|
| Name | 71 | yes | title |
| Author / Photographer | 69 | yes | photographer(s); `;` separates several people (e.g. "Greg Girard; Ian Lambot") |
| Color Type | 71 | yes | Color / Black & White / Mixed. Used for filtering and as a placeholder hint |
| Country / Region | 67 | yes | shown on detail page; used for filtering |
| Genre | 67 | yes | shown on detail page (39 different values, many one-offs) |
| Publish Year | 68 | yes | sort + display |
| Publisher | 67 | yes | display |
| Tags | 23 | yes | values: 中国摄影师, 中国题材 |
| Purchase Date | 1 | **no** | dropped |
| Short Description | 7 | **no** | hidden (some entries are wrong); may be revisited later |

Problems in the data the importer must handle:
- **No ISBN column.** Cover lookup has to go by title + photographer, so it will miss more often than an ISBN lookup would.
- **Duplicate title:** "China" appears twice (Hiroji Kubota, 1985; Yann Layma). Slugs include the photographer, e.g. `china-hiroji-kubota`.
- **Stray whitespace/newlines** in 16 cells (e.g. "A Photographer in Old Peking\n"). Trim everything.
- **One fully blank row.** Skip it.
- **Two books with no photographer** ("China: A Photo History", "Travels of a photographer in China").
- **Multilingual titles** (Chinese, Japanese, Russian, Turkish). Use fonts that cover CJK and Cyrillic. Slugs come from the romanized/English part when there is one, otherwise from a transliteration.
- A typo, "Austrilia". This is fixed in Notion, not in code.

### Assumptions (correct any that are wrong)

1. The column mapping above is right.
2. Re-exporting the CSV and re-running one command is fine for updates. There is no live sync with Notion.
3. The site is fully static (plain HTML/CSS/JS files), with no server and no database.
4. Covers are fetched **once at build time** and saved in the project. They are not hotlinked from other sites when the page loads.
5. Some photobooks (small presses, self-published, zines) won't be found online. Those get a typographic placeholder cover and can be fixed by hand.
6. Purchase Date (and any other column not on the public list) must **not** appear on the public site.
7. It needs to work on desktop and phone browsers. Old browsers aren't supported.

### User stories

- **Virtual bookshelf.** As a visitor, I see the books as spines standing on **three separate shelves, one per Color Type: Color, Black & White, Mixed**. Each shelf has a label and a count. Each spine shows the title and photographer, and its color comes from the cover. When I hover over or tap a spine, the book tilts or pulls out. Clicking it opens the book's detail page. Within a shelf, the books follow the chosen sort.
- **Look and feel: minimal white gallery.** Off-white background, lots of white space, thin hairline shelves rather than wooden ones, and a quiet sans-serif with small uppercase labels. The covers and spines supply the only strong color. The site stays light (no dark theme) so it reads like a gallery wall.
- **Flip-through carousel.** As a visitor, I can switch to a carousel of large covers, one book at a time. I move through it with the arrow keys, by swiping on a phone, or by clicking previous/next. It shows which book I'm on (e.g. "12 / 87").
- **Book detail page.** Each book has its own page with a stable URL (e.g. `/books/sleeping-by-the-mississippi`). It shows a large cover and every public field from Notion, with previous/next links and a link back to the view I came from.
- **Ordering and filtering.** I can sort the shelf and carousel by photographer, title or year (default: photographer). I can filter by Color Type, Country / Region and Tags.
- **Updating.** As the owner, I re-export the CSV from Notion, run one command, and the site rebuilds with new or changed books. Covers already found aren't downloaded again.

## Tech Stack

- **Astro 5** (static output). It gives each book its own page and sends very little JavaScript.
- **TypeScript** for the import/cover scripts and the small interactive parts.
- **Plain CSS** (CSS custom properties). No UI framework; the shelf and carousel are hand-built.
- **papaparse** to read the CSV.
- **sharp** to resize covers and pick each spine's main color.
- **Cover lookup:** Open Library search (title + photographer), with Google Books as a fallback. Neither needs an API key. A match is accepted only if both title and photographer match closely enough; otherwise it counts as a miss. A wrong cover is worse than a placeholder.
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`. It's a project site at `https://shu1995shijia.github.io/photobooks/`, so Astro's `base` is set to `/photobooks` and every link has to respect that prefix. A custom domain can be added later (that change removes the base path).

## Commands

```
Install:        npm install
Import data:    npm run import -- data/notion-export.csv   # CSV → src/data/books.json
Fetch covers:   npm run covers                              # find + download covers missing from public/covers/
Dev server:     npm run dev                                 # http://localhost:4321
Build:          npm run build                               # → dist/
Preview build:  npm run preview
Test:           npm test
Lint/format:    npm run lint && npm run format
```

## Project Structure

```
photobooks/
├── SPEC.md
├── data/
│   ├── notion-export.csv      → the raw Notion export (input)
│   └── cover-overrides.json   → hand fixes: {slug: image URL, local file, or an ISBN to look up}
├── scripts/
│   ├── import.ts              → CSV → books.json (picks public fields, makes slugs)
│   └── covers.ts              → looks up, downloads, resizes covers; records misses
├── src/
│   ├── data/books.json        → generated, normalized book list
│   ├── lib/                   → shared code: types, sorting, slugs
│   ├── components/            → Shelf, Spine, Carousel, Cover, BookMeta
│   ├── pages/
│   │   ├── index.astro        → shelf view
│   │   ├── carousel.astro     → carousel view
│   │   └── books/[slug].astro → detail page
│   └── styles/
├── public/covers/             → downloaded covers (committed)
└── tests/                     → unit tests for the scripts and lib
```

## Code Style

- TypeScript strict mode; Prettier defaults; kebab-case file names for scripts, PascalCase for components.
- One normalized `Book` type that every page reads. Pages never read the CSV directly.

```ts
export interface Book {
  slug: string;            // "the-americans-robert-frank"
  title: string;
  photographers: string[]; // split on ";"; empty when unknown
  colorType?: "Color" | "Black & White" | "Mixed";
  region?: string;
  genre?: string;
  year?: number;
  publisher?: string;
  tags: string[];
  cover?: { src: string; width: number; height: number; dominantColor: string };
}
```

## Testing Strategy

- **Vitest** unit tests for: CSV parsing and the mapping of columns to public fields, slug generation (unique, stable), sorting, and the cover-lookup order (with network calls faked).
- Build check: `npm run build` succeeds and creates one page per book.
- Checks I'll do by hand in the browser before calling it done: keyboard and swipe in the carousel, shelf on a phone-width screen, and every detail page has a cover or a placeholder.

## Boundaries

- **Always:** keep private Notion columns out of `books.json` (only listed public columns get through); save covers locally; keep URLs (slugs) stable when the CSV is re-imported; run tests before saying something is done.
- **Ask first:** which columns are public; publishing or deploying the site; adding dependencies beyond those listed; changing the URL structure.
- **Never:** commit Notion tokens or other secrets; hotlink cover images from other sites; scrape sites that forbid it.

## Success Criteria

1. Running `npm run import` on the real CSV gives exactly 71 books, with no blank rows, no Purchase Date, trimmed values and 71 unique slugs (both "China" books kept).
2. `npm run covers` finds a correct cover for at least 60% of books automatically. With no ISBNs and many small presses, that's a realistic target. Every miss is listed in the output so I can add it to `cover-overrides.json`. Books with no cover show a placeholder and don't break the layout.
3. The shelf shows all books (under 100) in a layout that works on 375px-wide phones and 1440px desktops.
4. The carousel works with ←/→ keys, swiping, and buttons, and shows "n / total".
5. Every book has a detail page at `/books/<slug>` with previous/next links.
6. The built site loads its first view in under 2 seconds on a normal connection (covers are resized to no more than ~600px and lazy-loaded).
7. The site is live on GitHub Pages, and every link and image works under the `/photobooks/` base path.
8. The shelf view shows three labeled shelves (Color, Black & White, Mixed) whose counts add up to 71.

## Open Questions

None. (`gh` is logged in as `shu1995shijia`. Creating the repo and turning on Pages are still "ask first".)

Decided (2026-10-18): GitHub Pages under user `shu1995shijia`, so the site will be at `https://shu1995shijia.github.io/photobooks/`; minimal white gallery look; separate shelves by Color Type; Short Description hidden; republishing cover images approved.
