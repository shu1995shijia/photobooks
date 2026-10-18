# Plan: Photobooks

This plan implements [SPEC.md](../SPEC.md). Tasks are in [todo.md](todo.md).

## Approach

Build in **vertical slices**. Every phase ends with something working that can be viewed in a browser, and the site goes live early. The riskiest parts, the GitHub Pages base path and the cover-lookup hit rate, get tested before the views are polished.

The data pipeline runs **on this Mac only**. GitHub Actions only builds and deploys the site from files already committed.

```
Notion CSV (data/, gitignored)
   │  npm run import
   ▼
src/data/books.json (committed, public fields only)
   │  npm run covers ── Open Library → Google Books → overrides
   ▼
public/covers/*.webp + src/data/covers.json (committed)
   │  npm run build (locally or in GitHub Actions)
   ▼
dist/ ──→ GitHub Pages: https://shu1995shijia.github.io/photobooks/
```

## Components and dependencies

| #   | Component                                                                    | Depends on | Notes                                                     |
| --- | ---------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| 1   | Project scaffold (Astro, TS strict, Vitest, Prettier, `base: "/photobooks"`) | none       |                                                           |
| 2   | Importer `scripts/import.ts` and `src/lib/` (types, slugs, sort, group)      | 1          | Has the most logic, so it gets unit tests                 |
| 3   | Base layout and gallery styles                                               | 1          | Typography, colors, spacing tokens                        |
| 4   | Detail pages `/books/[slug]` with placeholder covers                         | 2, 3       | **First slice that runs end to end**                      |
| 5   | Deploy workflow to GitHub Pages                                              | 4          | Proves the base path works early                          |
| 6   | Cover pipeline `scripts/covers.ts`                                           | 2          | Can be built alongside 7–8                                |
| 7   | Shelf view (3 Color Type shelves)                                            | 4          | Spine color comes from 6, with a gray fallback until then |
| 8   | Carousel view                                                                | 4          |                                                           |
| 9   | Sort and filter controls shared by shelf and carousel                        | 7, 8       | Saved in URL query, e.g. `?sort=year&region=Japan`        |
| 10  | Polish: phone layout, speed, accessibility, final check against spec         | all        |                                                           |

**Can run in parallel:** 6 (covers) alongside 7 and 8 (views). 7 and 8 also don't depend on each other.
**Must be in order:** 1 → 2 → 4 → 5, and 9 after both views exist.

## Milestone 1: carousel only

At the user's request (2026-10-18), the carousel is built first, before detail pages, deploy and covers. Order: tasks 1, 2, 3, 4, then 10. Task 10 is adjusted for this milestone: placeholder covers, and the cover doesn't link anywhere yet. The checkpoint is a working carousel at `npm run dev`, which you review.

## Phases and checkpoints

### Phase A: Foundation and first live slice (tasks 1–5)

**Checkpoint A:** `https://shu1995shijia.github.io/photobooks/` is live. It has an index page listing 71 books. Each title links to a working detail page with a placeholder cover. Tests pass. **You review the site before Phase B.**

### Phase B: Covers (task 6)

**Checkpoint B:** `npm run covers` finished. I report how many covers it found and list the misses. You check that the matched covers are the right books (I'll make a contact sheet page to make this quick) and add overrides for the misses if you want.

### Phase C: Browsing views (tasks 7–9)

**Checkpoint C:** the shelf (3 shelves, counts add up to 71), the carousel (keys, swipe, buttons, "n / 71") and sort/filter all work locally and are deployed. **You review the look and feel before polish.**

### Phase D: Polish (task 10)

**Checkpoint D:** every Success Criterion in the spec is checked off, with evidence (test output, Lighthouse score, screenshots at phone and desktop widths).

## Key technical decisions

- **Slugs** are `title-photographer`, transliterated to ASCII (e.g. `china-hiroji-kubota`). For CJK titles with an English part in parentheses, like `China Adagio (漫游中国)`, the English part is used. Titles with only CJK text get a pinyin/romaji transliteration (library `transliteration`, needs approval). Slugs are stored in `books.json`, and a re-import keeps an existing book's slug, so URLs stay the same.
- **Cover matching:** each candidate gets a score from title similarity (normalized, ignoring punctuation and subtitles) and photographer surname match. Anything below a threshold is a **miss, not a guess**. Results are cached in `src/data/covers.json`, so books already found are skipped on re-runs. Requests are throttled to about 1 per second with a descriptive User-Agent, as Open Library asks.
- **Images:** resized to 600px wide WebP, plus 1200px for the detail page. The main color is extracted by `sharp`. Black & White books will mostly get grey spines, which is correct.
- **Fonts:** Libre Franklin from Google Fonts (400, 500, 700, italic 400), falling back to `"PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", sans-serif` for Chinese, Japanese and Cyrillic.
- **Interactivity:** small vanilla TypeScript scripts in Astro components. There's no UI framework. View transitions (Astro `<ClientRouter />`) make moving shelf → book → back feel smooth.
- **Private data:** the importer reads columns from an explicit **allowlist**. A test checks that `books.json` never contains Purchase Date or Short Description.

## Risks and mitigations

| Risk                                                        | Likelihood | Mitigation                                                                                                                                                                                   |
| ----------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover hit rate is low (no ISBNs, small presses, CJK titles) | High       | Strict matching plus a miss report plus `cover-overrides.json`. A contact sheet makes reviewing quick. The typographic placeholders are designed to look good on their own, not like errors. |
| A wrong cover gets matched                                  | Medium     | Score threshold plus your review at Checkpoint B                                                                                                                                             |
| Base path breaks links or images on Pages                   | Medium     | Deploy in Phase A. All URLs go through one `url()` helper                                                                                                                                    |
| Open Library or Google Books rate limits                    | Low        | Throttle, cache, resumable runs                                                                                                                                                              |
| `sharp` fails to install on Node 25                         | Low        | Pin the Node LTS version in `.nvmrc` and in CI if needed                                                                                                                                     |
| Raw CSV committed to the public repo by accident            | Low        | `data/*.csv` is in `.gitignore`. I check `git status` before each commit                                                                                                                     |

## Dependencies to add (approval needed per spec)

`astro`, `typescript`, `vitest`, `prettier`, `prettier-plugin-astro`, `papaparse`, `sharp`, `transliteration`, plus `tsx` to run the scripts. Each is pinned to an exact version.
