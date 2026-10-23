# Your own covers

Put a cover image here and it replaces whatever cover the book has now.

**Name the file after the book's slug**: the last part of its page address.
For https://shu1995shijia.github.io/photobooks/books/the-americans-robert-frank
the file is `the-americans-robert-frank.jpg`.

JPEG, PNG, WebP, AVIF, GIF and TIFF all work. Use an image at least 600px wide
(1200px or more looks best). A plain white border around the cover is trimmed off.

A pale cover with no background around it can be mistaken for a border and
trimmed into. If the image is already cut exactly to the cover's edge, add
`.exact` before the extension (`the-americans-robert-frank.exact.jpg`) and it's
used as it is.

## On github.com

1. Open this folder (`data/covers`) in the repository.
2. Choose **Add file → Upload files**, drop the image in and commit it to `main`.
3. The site rebuilds by itself; the new cover is live in a minute or two.
   You can follow it under the **Actions** tab.

To replace a cover again, upload a new file with the same name. To go back to
the cover found online, delete the file; the book shows a placeholder until
`npm run covers` is run on a computer.

If a file isn't named after a book, it's skipped, and the Actions log
lists it with the closest name it could find.

## On your computer

Copy the image here, run `npm run covers`, then commit and push.

## Photos taken at an angle

If the photo shows the book tilted or in perspective, straighten it on a
computer by giving the cover's four corners (in pixels, clockwise from top left):

    npm run flatten -- data/covers/<slug>.jpg 88,16 761,64 761,748 88,781

The untouched photo is kept in `originals/` (ignored by the site), so you can
run it again with better corners. Add `--aspect=<width/height>` when a book
turned sideways comes out too narrow. Then run `npm run covers`.
