---
name: add-book
description: Add a new photobook to the Photobooks catalog from a cover image and/or a few details (title, photographer, ISBN, a shop link). Identifies the book, researches every catalog field online, prepares the cover (rename, trim, straighten a tilted photo), adds it with npm run add-book, checks it, and publishes. Use when the user says "add this book", "add a new book", drops a cover image for a book that isn't in the catalog yet, or runs /add-book.
---

# Add a book to the catalog

The user gives you a cover image, some details, or both. Everything else is your job: identify the book, fill in every field, prepare the cover, add it, check it, publish it. Ask the user only for what you can't find or decide.

Run every command from the project root (`/Users/sshu/Documents/projects/photobooks`).

## 1. Gather the input

- **An image path** (often in `data/covers/` under a shop's file name such as `s-l1600.webp`, or a screenshot): look at it with Read. For AVIF or other formats Read can't open, convert a preview first:
  `node -e 'require("sharp")(process.argv[1]).png().toFile(process.argv[2])' <image> <scratchpad>/preview.png`
- **Text** (title, photographer, ISBN, a link): use it as given.
- From the cover, read the title, photographer(s), publisher and any subtitle, edition or year printed on it.

## 2. Make sure it's new

Search `src/data/books.json` for the title and photographer (case-insensitive, and the romanized and original-script forms). If the book is already there, it isn't a new book: say so, and offer to use the image as its cover instead. That means renaming the image to `data/covers/<existing slug>.<ext>` and continuing from step 5.

## 3. Research the fields

Search the web (WebSearch, `mode: "standard"`; use `"extended"` only if standard results are thin). Prefer the publisher's own page, then specialist photobook sellers and libraries (Open Library, WorldCat), then general shops. Confirm the edition matches the cover: reprints often differ in year and publisher.

Fill in these fields, following the conventions already in `books.json`:

| Field | What to put | Notes |
|---|---|---|
| `title` | Title as on the cover, in title case | A non-Latin title gets its English or romanized title in parentheses, as in `"China Adagio (漫游中国)"` or `"しなやかな たね（柔韧的种子）"`. |
| `photographers` | List of names | Use the original script in parentheses where the catalog does, e.g. `"Andrew S.T. Wong (王身敦)"`. Editors get `" (ed.)"`. Collectives such as `"Magnum Photos"` are fine. |
| `colorType` | `"Color"`, `"Black & White"` or `"Mixed"` | Judge from the photographs inside (check reviews and previews), not only the cover. |
| `region` | Where the work is set or about | If the work isn't tied to a place, use the photographer's country. Existing values include `United States`, `Japan`, `China`, `Germany`, `Hong Kong`, `France`, `Global`; reuse them. |
| `genre` | Slash-separated, broad first | e.g. `"Documentary Photography / Urban Japan"`. Start with an existing broad value (`Documentary`, `Documentary Photography`, `Street Photography`, `Portrait`, `Personal Documentary`, `Conceptual`, `Photography History`) and add up to three specifics. |
| `year` | Year of this edition, as a number | |
| `publisher` | Publisher of this edition | |
| `tags` | Ask the user (step 4) | Work out which existing tags fit, to suggest them: today `"中国题材"` (China as subject) and `"中国摄影师"` (a Chinese photographer). |
| `location` | Ask the user (step 4) | Where this copy is kept. Leave the field out for `"Brooklyn, NY"`, the default; include it for anywhere else. |

Never add anything private: purchase dates, prices paid or personal notes.

## 4. Confirm, then add

Before adding anything, show the user **every attribute that will be added**, so nothing goes in unseen. Use one table with a row for each of these, even when a value is empty or a default:

| Row | What to show |
|---|---|
| Title | as it will appear |
| Photographers | each name, as written |
| Color type | Color / Black & White / Mixed |
| Country / region | |
| Genre | |
| Year | |
| Publisher | |
| Tags | the tags the user chose in the tag question (below), or "none" |
| Location | the location the user chose in the location question (below) |
| Page address | `/books/<slug>`, worked out the way `npm run add-book` will (title, then first photographer, lowercased and hyphenated) |
| Cover | where the image comes from (the user's file, or a URL), its size, and what will be done to it: used as is, borders trimmed, or straightened (and whether `--aspect` will be needed) |

First ask two questions in one AskUserQuestion call: where the book is kept, and its tags.

**Tags.** List every tag in use on the site today, with how many books have it:

```
node -e 'const c={};for(const b of require("./src/data/books.json"))for(const t of b.tags)c[t]=(c[t]||0)+1;for(const [t,n] of Object.entries(c).sort((a,b)=>b[1]-a[1]))console.log(`${t}  ${n} books`)'
```

Ask with `multiSelect: true`. Give one option per tag (label: the tag; description: what it means, how many books have it, and "Suggested" if your research says it fits), plus a **No tags** option. AskUserQuestion allows at most four options, so if there are more than three tags, offer the three most used plus No tags, and list the rest in the question text so the user can type them under "Other". The user can also type a new tag there. Write a new tag the way the existing ones are written. Each tag gets its own page on the site (`/tags/<slug>`), so a new tag creates one. Put the chosen tags in the Tags row and in the JSON (`[]` for none).

**Location.** Ask with one option for each place in `LOCATIONS` in `src/lib/book.ts` (today **Brooklyn, NY** and **Beijing, China**), with Brooklyn, NY first and marked as the default. The user can type another place under "Other". Write a new place the way the existing ones are written ("City, State" in the US, "City, Country" elsewhere). Put the answer in the Location row. For anything other than Brooklyn, NY, add `"location"` to the JSON. For a place that isn't in `LOCATIONS` yet, also add it to that list, so it shows in the site's location menu, and commit that change with the book in step 7.

Give the source for each researched value in a third column, and mark anything uncertain. Under the table, also show the exact JSON you'll pass to `npm run add-book`. Then ask once with AskUserQuestion: **Add it** / **Change something**. Their "Add it" also covers publishing in step 7. If they change something, show the whole table again before adding. Then:

```
npm run add-book -- '<the entry as JSON>'
```

It validates the fields, refuses duplicates, writes the book to `data/added-books.json` and `src/data/books.json`, and prints the new slug. If it says "Not added", fix what it reports and run it again.

## 5. Prepare the cover

Copy or rename the image to `data/covers/<slug>.<ext>`, keeping its extension. If there is no image, skip to `npm run covers` in step 6, which searches Open Library and Google Books.

Then decide what the image needs:

- **A flat scan or shop image** that is the cover itself: nothing; the next step trims plain borders.
- **A photo of the book** (background around it, tilted, in perspective, or with the spine showing): straighten it.
  1. Make a preview about 700px wide and read rough corners of the **front cover** off it: top left, top right, bottom right, bottom left. Exclude the spine and any slipcase edge. Scale them to the full image size.
  2. Refine them: `npm run corners -- data/covers/<slug>.<ext> 20 x,y x,y x,y x,y`. Add `--contrast` for a pale book on a pale background. Look at the outline and close-up images it writes. If it warns about a side, or a close-up shows the line off the book's edge, find that edge yourself: average the brightness across the edge over a band of rows or columns (a small `node -e` script with sharp) and use the column or row where it jumps. Hinges and spine joins show up as a narrow highlight.
  3. Move each corner 2–3px inside the edge, so no background survives, then flatten: `npm run flatten -- data/covers/<slug>.<ext> tl tr br bl`. The untouched photo is kept in `data/covers/originals/`, so flatten can be re-run with better corners.
  4. **If the book is turned sideways** (one side clearly shorter than the other), the result comes out too narrow. Add `--aspect=<width/height>` from the book's real size (publisher's dimensions), or from an earlier flat scan of the same book, or from something on the cover of known shape. Say which you used.

## 6. Process and check

```
npm run covers -- --uploads-only     # or: npm run covers   (when searching online for a cover)
```

Look at `public/covers/<slug>-600.webp` with Read, on a coloured background so leftover borders show. Check for: the right book, no background or spine, nothing cut off, natural proportions. If it's wrong, fix and repeat step 5. Note if the image is under 600px wide, since it will look soft.

Then:

```
npm test
npm run build
```

Both must pass. The build should make one more book page than before.

## 7. Publish

Commit only the files for this book: `data/added-books.json`, `src/data/books.json`, `src/data/covers.json`, `data/covers/<slug>.*`, `data/covers/originals/<slug>.*` (if flattened), `public/covers/<slug>-*.webp`, and `src/lib/book.ts` if you added a new location. Use a message like `Add <Title> (<Photographer>)`. Push to `main`, then watch the deploy:

```
gh run watch $(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

## 8. Report

Tell the user:
- The book's address: `https://shu1995shijia.github.io/photobooks/books/<slug>`
- The fields you filled in, with what was uncertain.
- What was done to the cover.
- **A reminder to add the book to Notion too**, with the row ready to paste: Name, Author / Photographer (`;`-separated), Color Type, Country / Region, Genre, Publish Year, Publisher, Tags. Notion is the master catalog. Once the book is there, the next `npm run import` uses the Notion row and says to remove the entry from `data/added-books.json`.
