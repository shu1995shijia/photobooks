/**
 * Finds the exact corners of a book in a photo, from rough ones, for `npm run flatten`.
 *
 *   npm run corners -- <image> <radius> tl tr br bl [--contrast]
 *
 * Each rough corner is "x,y" (top left, top right, bottom right, bottom left
 * of the cover). Along each side it looks up to <radius> pixels either way
 * for the strongest edge, fits a straight line through those points, and
 * intersects the lines. --contrast helps with a pale book on a pale background.
 *
 * Prints the corners, warns about sides it couldn't follow (few edge points
 * or a wide spread: check those by eye), and writes an outline image and
 * close-ups of the four corners to the system temp folder.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Point, Quad } from "./flatten";

/** How many edge points a side needs, and how far they may stray from its line, to be trusted. */
const MIN_POINTS = 20;
const MAX_SPREAD = 2;
/** Brightness difference (0–255) across a pixel that counts as an edge. */
const MIN_STEP = 12;

interface Line {
  p: Point;
  d: Point;
  points: number;
  spread: number;
}

function fit(points: Point[]): { p: Point; d: Point } {
  const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
  const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: [mx, my], d: [Math.cos(angle), Math.sin(angle)] };
}

const offLine = (line: { p: Point; d: Point }, [x, y]: Point) =>
  Math.abs((x - line.p[0]) * line.d[1] - (y - line.p[1]) * line.d[0]);

function meet(a: Line, b: Line): Point {
  const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  const u = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
  return [Math.round(a.p[0] + a.d[0] * u), Math.round(a.p[1] + a.d[1] * u)];
}

/** Refines `rough` corners to the strongest straight edges nearby. */
export async function findCorners(
  image: Buffer,
  rough: Quad,
  radius: number,
  contrast = false,
): Promise<{ corners: Quad; lines: Line[] }> {
  let pipeline = sharp(image).rotate().greyscale();
  if (contrast)
    pipeline = pipeline.normalise({ lower: 1, upper: 60 }).linear(4, -700);
  const { data, info } = await pipeline
    .blur(1.2)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) =>
    data[
      Math.min(h - 1, Math.max(0, Math.round(y))) * w +
        Math.min(w - 1, Math.max(0, Math.round(x)))
    ];

  const lines: Line[] = [];
  for (let side = 0; side < 4; side++) {
    const a = rough[side];
    const b = rough[(side + 1) % 4];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const n: Point = [-t[1], t[0]];
    const found: Point[] = [];
    for (let k = 0.1; k <= 0.9; k += 0.02) {
      const p: Point = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      let best = 0;
      let bestD = 0;
      for (let d = -radius; d <= radius; d++) {
        const step = Math.abs(
          at(p[0] + n[0] * (d + 1), p[1] + n[1] * (d + 1)) -
            at(p[0] + n[0] * (d - 1), p[1] + n[1] * (d - 1)),
        );
        if (step > best) {
          best = step;
          bestD = d;
        }
      }
      if (best > MIN_STEP)
        found.push([p[0] + n[0] * bestD, p[1] + n[1] * bestD]);
    }
    if (found.length < 2) {
      // Too few edge points to fit: keep the rough side, and say so.
      lines.push({ p: a, d: t, points: found.length, spread: Infinity });
      continue;
    }
    // Fit, drop the 30% of points furthest from the line (text, shadows), fit again.
    const first = fit(found);
    const kept = [...found]
      .sort((u, v) => offLine(first, u) - offLine(first, v))
      .slice(0, Math.ceil(found.length * 0.7));
    const line = fit(kept);
    lines.push({
      ...line,
      points: found.length,
      spread: Math.max(...kept.map((q) => offLine(line, q))),
    });
  }
  // Side s runs from corner s to corner s+1, so corner c is where sides c-1 and c meet.
  const corners = [0, 1, 2, 3].map((c) =>
    meet(lines[(c + 3) % 4], lines[c]),
  ) as Quad;
  return { corners, lines };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const contrast = args.includes("--contrast");
  const [file, radiusArg, ...points] = args.filter((a) => a !== "--contrast");
  if (!file || !radiusArg || points.length !== 4) {
    console.error(
      "Usage: npm run corners -- <image> <radius> tl tr br bl [--contrast]   (each corner as x,y)",
    );
    process.exit(1);
  }
  const rough = points.map((p) => p.split(",").map(Number)) as Quad;
  const original = await sharp(file).rotate().png().toBuffer();
  const { corners, lines } = await findCorners(
    original,
    rough,
    Number(radiusArg),
    contrast,
  );

  const names = ["top", "right", "bottom", "left"];
  console.log(`corners: ${corners.map((c) => c.join(",")).join(" ")}`);
  lines.forEach((line, i) => {
    if (line.points < MIN_POINTS || line.spread > MAX_SPREAD)
      console.warn(
        `  check the ${names[i]} side: ${line.points} edge points, spread ${line.spread.toFixed(1)}px`,
      );
  });

  const { width = 0, height = 0 } = await sharp(original).metadata();
  const outline = `<svg width="${width}" height="${height}"><polygon points="${corners.map((c) => c.join(",")).join(" ")}" fill="none" stroke="#f0f" stroke-width="${Math.max(1, width / 500)}"/></svg>`;
  const marked = await sharp(original)
    .composite([{ input: Buffer.from(outline) }])
    .png()
    .toBuffer();
  const dir = join(tmpdir(), "photobooks-corners");
  mkdirSync(dir, { recursive: true });
  const name = basename(file, extname(file));
  const overview = join(dir, `${name}-outline.png`);
  await sharp(marked)
    .resize(700, 700, { fit: "inside" })
    .png()
    .toFile(overview);

  const size = 30;
  const tiles = await Promise.all(
    corners.map(async ([x, y], i) => ({
      input: await sharp(marked)
        .extract({
          left: Math.max(0, Math.min(width - 2 * size, x - size)),
          top: Math.max(0, Math.min(height - 2 * size, y - size)),
          width: 2 * size,
          height: 2 * size,
        })
        .resize(240, 240, { kernel: "nearest" })
        .png()
        .toBuffer(),
      left: i * 250,
      top: 0,
    })),
  );
  const closeups = join(dir, `${name}-corners.png`);
  await sharp({
    create: { width: 1000, height: 240, channels: 3, background: "#000" },
  })
    .composite(tiles)
    .png()
    .toFile(closeups);
  console.log(
    `outline: ${overview}\nclose-ups (top left, top right, bottom right, bottom left): ${closeups}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
