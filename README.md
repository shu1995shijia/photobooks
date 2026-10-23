# Photobooks

A personal catalog of photobooks, hung like a small gallery.

**Live site:** https://shu1995shijia.github.io/photobooks/

## What's on the site

- **Carousel:** large covers in a Cover Flow, one book at a time. Use ←/→, drag, swipe or the buttons to move.
- **Tile:** every cover stitched edge to edge in full-width rows. **Shuffle** puts them in a random order.
- **Daily:** a shelf of five books for the day, the day's book in the middle, the same for everyone (New York time). Every book comes round before any returns, and a book bought on this day in an earlier year becomes the day's book. ← and → go to other days.
- **Pick for me:** spins to a random book and opens it.
- **Book popup:** clicking a cover opens the book over the page, flipping open beside its cover. Esc, ← or Back closes it. Every book also has its own page at `/books/<slug>`.
- **Photographer and tag pages:** `/photographers/<name>` and `/tags/<tag>` show all of a photographer's books, or all the books with a tag.
- **Search:** in the header. Finds books by title, photographer, publisher, region, genre or tag.
- **Location menu:** hover over the location under the site name to show only the books kept in one place (Brooklyn, NY or Beijing, China).

## How it works

A static site built with [Astro](https://astro.build), TypeScript and plain CSS. GitHub Actions deploys it to GitHub Pages on every push to `main` (see `.github/workflows/deploy.yml`).

### The catalog

The master catalog lives in Notion. Export it as CSV to `data/notion-export.csv` (gitignored, since the export holds private columns), then run:

```sh
npm run import
```

This writes `src/data/books.json`. Only the public columns get through: title, photographers, color type, country/region, genre, year, publisher and tags. A book's address (its slug) stays the same across re-imports.

Books not in Notion yet can be added with `npm run add-book`. They're kept in `data/added-books.json` and merged in on import, until the same book turns up in Notion.

### Covers

Covers are saved in the repo (`public/covers/`, resized to 600px and 1200px WebP). The site never loads images from other sites. `npm run covers` fills them in from, in order of priority:

1. **Your own images in `data/covers/`**, named after the book's slug, e.g. `data/covers/the-americans-robert-frank.jpg`. Upload one on github.com and the deploy processes it (see [`data/covers/README.md`](data/covers/README.md)).
2. **`data/cover-overrides.json`**, which maps a slug to an image URL or an ISBN.
3. **Open Library, then Google Books**, searched by title and photographer. A result is used only when both match.

Plain borders are trimmed automatically. For a photo of a book taken at an angle:

```sh
npm run corners -- data/covers/<slug>.jpg 20 tl tr br bl   # refine rough corners, given as x,y
npm run flatten -- data/covers/<slug>.jpg tl tr br bl      # straighten into a flat cover
```

`flatten` keeps the untouched photo in `data/covers/originals/`.

### Adding a book with Claude Code

In Claude Code, `/add-book` (defined in `.claude/skills/add-book/`) adds a book from a cover image, a title or a link:

1. It identifies the book and researches every field online.
2. It looks for a cover, if you didn't give one.
3. It asks for tags, location and date, and shows you the full entry to confirm.
4. It prepares the cover, adds the book, checks it and publishes it.

## Commands

| Command                               | What it does                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                         | Local dev server at http://localhost:4321/photobooks/                                   |
| `npm run build`                       | Build the site into `dist/`                                                             |
| `npm run preview`                     | Serve the built site                                                                    |
| `npm test`                            | Run the tests (Vitest)                                                                  |
| `npm run lint` / `npm run format`     | Check / fix formatting (Prettier)                                                       |
| `npm run import`                      | Notion CSV → `src/data/books.json`                                                      |
| `npm run add-book -- '<json>'`        | Add a book that isn't in Notion yet                                                     |
| `npm run covers`                      | Find and process covers. `--uploads-only` processes `data/covers/` without going online |
| `npm run corners` / `npm run flatten` | Straighten a photo of a book                                                            |

To use your own Google Books quota, put `GOOGLE_BOOKS_API_KEY=…` in `.env` (gitignored).

## Project layout

```
data/                   Notion export (gitignored), added books, cover uploads and overrides
public/covers/          processed covers, served by the site
scripts/                import, covers, add-book, corners, flatten
src/data/               books.json and covers.json, read by every page
src/lib/                book model, sorting, slugs, search, photographers, tags
src/components/         header, cover, wall label, carousel, book popup
src/pages/              carousel, tile, daily, books/, photographers/, tags/
src/scripts/            browser code: carousel, popup, shuffle, location, search
tests/                  unit tests
```

## Copyright

© Shijia Shu. All rights reserved. Cover images and photographs are © their photographers and publishers, shown only to identify the books in this collection.
