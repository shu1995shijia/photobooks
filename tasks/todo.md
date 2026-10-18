# Tasks: Photobooks

Follows [plan.md](plan.md). Do them in order; ⇄ marks tasks that can run in parallel.

## Phase A: Foundation and first live slice

- [x] **1. Scaffold the project** _(done 2026-10-18; `covers` script added with task 7)_
  - Acceptance: Astro project with TS strict, `base: "/photobooks"`, `site: "https://shu1995shijia.github.io"`; scripts `dev`, `build`, `preview`, `test`, `lint`, `format`, `import`, `covers` are in `package.json`; `.gitignore` covers `data/*.csv`.
  - Verify: `npm run build` and `npm test` both succeed (with a placeholder test).
  - Files: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [x] **2. Book model and helpers** _(done 2026-10-18; `groupByColorType()` moves to task 9, where the shelf needs it)_
  - Acceptance: `Book` type as in the spec; `slugify()` (ASCII, uses the English part in parentheses, unique and stable); `sortBooks()` by photographer, title or year; `groupByColorType()` returning shelves in the order Color, Black & White, Mixed; `url()` helper that adds the base path.
  - Verify: `npm test`, unit tests for each helper, including the duplicate "China" and the CJK-only titles.
  - Files: `src/lib/book.ts`, `src/lib/slug.ts`, `src/lib/sort.ts`, `src/lib/url.ts`, `tests/lib.test.ts`

- [x] **3. CSV importer** _(done 2026-10-18: 71 books, 71 unique slugs, no private fields)_
  - Acceptance: `npm run import -- data/notion-export.csv` writes `src/data/books.json` with exactly 71 books; values trimmed; the blank row skipped; photographers split on `;`; only allowlisted columns; slugs from an earlier `books.json` kept.
  - Verify: `npm test` (a fixture CSV covering every data problem from the spec), then a run on the real CSV prints `71 books`; `grep -c "Purchase\|Short Description" src/data/books.json` → 0.
  - Files: `scripts/import.ts`, `tests/import.test.ts`, `tests/fixtures/sample.csv`, `src/data/books.json`

- [x] **4. Gallery layout and design tokens** _(done 2026-10-18; the Shelf nav link is added with task 9)_
  - Acceptance: a base layout with the off-white background, system font stack, spacing and type scale, small uppercase labels, header (site title plus Shelf / Carousel nav) and footer.
  - Verify: `npm run dev`, then check the page by eye at 375px and 1440px.
  - Files: `src/layouts/Base.astro`, `src/styles/global.css`, `src/components/Header.astro`

- [x] **5. Detail pages and placeholder covers** _(done 2026-10-18: real cover where found, placeholder otherwise; previous/next follow the carousel's photographer order and wrap round. No temporary index: `/` still opens the carousel, whose covers now link to the detail pages, and its no-JavaScript fallback is a list of every book. The back link goes to the carousel until the shelf exists (task 9))_
  - Acceptance: `/books/<slug>` for all 71 books shows a cover (typographic placeholder for now: title and photographer, tinted by Color Type), every public field, previous/next links and a back link; a temporary index page lists every book with a link.
  - Verify: `npm run build` creates 71 pages under `dist/books/`; click through 5 books in `npm run preview`, including both "China" books and a CJK title.
  - Files: `src/pages/books/[slug].astro`, `src/pages/index.astro`, `src/components/Cover.astro`, `src/components/BookMeta.astro`

- [ ] **6. Deploy to GitHub Pages** ⚠️ _ask first: turns on Pages for the repo_
  - Acceptance: `.github/workflows/deploy.yml` builds and deploys on push to `main`; Pages source set to "GitHub Actions".
  - Verify: the Actions run succeeds; `https://shu1995shijia.github.io/photobooks/` loads; a detail page and its CSS load under `/photobooks/`.
  - Files: `.github/workflows/deploy.yml`

**→ Checkpoint A: you review the live site.**

## Phase B: Covers

- [ ] **7. Cover lookup and download** ⇄ (can run alongside 9–10) _(script done 2026-10-18; 21 of 71 found, all checked correct; below the 60% target because Open Library has few photobook covers and keyless Google Books hits its shared daily quota)_
  - Acceptance: `npm run covers` searches Open Library, then Google Books, for each book with no cover yet; scores the candidates and accepts only those above the threshold; saves 600px and 1200px WebP to `public/covers/`; records the dimensions and main color in `src/data/covers.json`; throttles to about 1 request per second; re-running skips books already found.
  - Verify: `npm test` (scoring and fallback order with fake network calls); the real run prints found/missed counts and the list of misses; aim for at least 60% found.
  - Files: `scripts/covers.ts`, `src/lib/match.ts`, `tests/match.test.ts`, `src/data/covers.json`, `public/covers/`

- [ ] **8. Overrides and contact sheet**
  - Acceptance: `data/cover-overrides.json` accepts an image URL, a local file path or an ISBN per slug, and an override always takes priority; a dev-only page `/dev/covers` shows every cover beside its title and photographer for quick checking; `Cover.astro` uses the real cover when there is one.
  - Verify: add a test override, re-run `npm run covers` and check it's used; open `/dev/covers`; make sure `/dev/` isn't in the production build.
  - Files: `scripts/covers.ts`, `data/cover-overrides.json`, `src/pages/dev/covers.astro`, `src/components/Cover.astro`

**→ Checkpoint B: you check the matched covers and the misses.**

## Phase C: Browsing views

- [ ] **9. Shelf view** ⇄
  - Acceptance: `/` shows three labeled shelves (Color, Black & White, Mixed) with counts; spines show title and photographer, colored by the cover's main color (gray fallback); the spine pulls out on hover, focus or tap; clicking opens the detail page; shelves wrap on narrow screens.
  - Verify: the counts add up to 71; usable with the keyboard alone (Tab through the spines, Enter opens); check by eye at 375px and 1440px.
  - Files: `src/pages/index.astro`, `src/components/Shelf.astro`, `src/components/Spine.astro`

- [x] **10. Carousel view** ⇄ _(milestone 1 version done 2026-10-18: placeholder covers; `/` redirects here until the shelf exists. Restyled as Cover Flow on 2026-10-18 at your request: angled books on both sides with reflections; drag/swipe scrubs, sideways trackpad scroll and clicking a side book also move it; real covers where found. The front cover links to its detail page since task 5)_
  - Acceptance: `/carousel` shows one large cover at a time; ←/→ keys, swiping and buttons all work; the counter reads "n / 71"; the current book is kept in the URL (`#slug`) so a reload stays on the same book; clicking the cover opens its detail page; nearby covers are preloaded.
  - Verify: test all three ways of moving, on desktop and on a phone-size window; reload in the middle and confirm it stays on the same book.
  - Files: `src/pages/carousel.astro`, `src/components/Carousel.astro`, `src/scripts/carousel.ts`

- [ ] **11. Sort and filter**
  - Acceptance: a shared control bar on the shelf and carousel: sort (photographer, title, year) and filters (Color Type, Country / Region, Tags); state lives in the URL query, so it survives moving between views; "n of 71 books" updates.
  - Verify: unit tests for filter logic; filter Region = Japan and check the shelf and carousel show the same books.
  - Files: `src/components/Controls.astro`, `src/scripts/controls.ts`, `src/lib/filter.ts`, `tests/filter.test.ts`

**→ Checkpoint C: you review the look and feel.**

## Phase D: Polish

- [ ] **12. Responsive, performance and accessibility pass**
  - Acceptance: no horizontal scrolling at 375px; covers lazy-loaded with width/height set (no layout shift); alt text on images; visible focus styles; respects `prefers-reduced-motion`.
  - Verify: Lighthouse on the deployed site: Performance ≥ 90, Accessibility ≥ 95; first view < 2s.
  - Files: CSS and component tweaks as needed

- [ ] **13. Final check against the spec**
  - Acceptance: every Success Criterion in SPEC.md checked off with evidence; a README with the update steps (export CSV → import → covers → push).
  - Verify: walk through the Success Criteria list.
  - Files: `README.md`, `SPEC.md` (mark as done)
