/**
 * Straightens a photo of a book taken at an angle, so the cover is a flat rectangle.
 *
 *   npm run flatten -- data/covers/<slug>.jpg  tl  tr  br  bl  [--aspect=0.97]
 *
 * Each corner is "x,y" in the image's pixels: top left, top right, bottom
 * right, bottom left of the cover (not the spine). The untouched image is
 * kept in data/covers/originals/, and corrections always start from it, so
 * the command can be re-run with better corners. Run `npm run covers`
 * afterwards to use the result.
 *
 * A book turned sideways looks narrower than it is, and the corners alone
 * can't tell by how much. --aspect sets the cover's width ÷ height when it's
 * known (from the book's size, or something printed on it of known shape).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type Sharp } from "sharp";

export type Point = [number, number];
/** Top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

const ORIGINALS = "data/covers/originals";

/**
 * The projective transform taking each `from` point to its `to` point, as the
 * 8 coefficients of [a b c; d e f; g h 1]. Solves the usual 8×8 system.
 */
export function homography(from: Quad, to: Quad): number[] {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    if (Math.abs(rows[col][col]) < 1e-12) throw new Error("corners don't form a quadrilateral");
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = rows[r][col] / rows[col][col];
      for (let c = col; c < 9; c++) rows[r][c] -= f * rows[col][c];
    }
  }
  return rows.map((row, i) => row[8] / row[i]);
}

export function apply(h: number[], [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + 1;
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

const distance = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(ax - bx, ay - by);

/** The cover's size once flat: the longer of each pair of opposite sides. */
export function flatSize([tl, tr, br, bl]: Quad): { width: number; height: number } {
  return {
    width: Math.round(Math.max(distance(tl, tr), distance(bl, br))),
    height: Math.round(Math.max(distance(tl, bl), distance(tr, br))),
  };
}

/** Maps the quadrilateral `corners` in `image` onto a flat rectangle (bilinear sampling). */
export async function flatten(image: Buffer, corners: Quad, aspect?: number): Promise<Buffer> {
  const { data, info } = await sharp(image).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: sw, height: sh, channels } = info;
  const size = flatSize(corners);
  const height = size.height;
  const width = aspect ? Math.round(height * aspect) : size.width;
  const rect: Quad = [
    [0, 0],
    [width - 1, 0],
    [width - 1, height - 1],
    [0, height - 1],
  ];
  const h = homography(rect, corners); // for each output pixel, where to read in the photo
  const out = Buffer.alloc(width * height * channels);
  const at = (x: number, y: number, c: number) =>
    data[(Math.min(sh - 1, Math.max(0, y)) * sw + Math.min(sw - 1, Math.max(0, x))) * channels + c];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = apply(h, [x, y]);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < channels; c++) {
        const top = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
        const bottom = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
        out[(y * width + x) * channels + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

function parsePoint(text: string): Point {
  const [x, y] = text.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`"${text}" isn't a point like 120,45`);
  return [x, y];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const aspectArg = args.find((a) => a.startsWith("--aspect="));
  const aspect = aspectArg ? Number(aspectArg.slice("--aspect=".length)) : undefined;
  if (aspect !== undefined && !(aspect > 0)) throw new Error(`${aspectArg} isn't a positive number`);
  const [file, ...points] = args.filter((a) => a !== aspectArg);
  if (!file || points.length !== 4) {
    console.error("Usage: npm run flatten -- data/covers/<slug>.jpg tl tr br bl [--aspect=w/h]   (each corner as x,y)");
    process.exit(1);
  }
  mkdirSync(ORIGINALS, { recursive: true });
  const original = `${ORIGINALS}/${basename(file)}`;
  if (!existsSync(original)) copyFileSync(file, original);

  const corners = points.map(parsePoint) as Quad;
  const flat = await flatten(readFileSync(original), corners, aspect);
  const ext = extname(file).toLowerCase();
  const pipeline = sharp(flat);
  const encoders: Record<string, () => Sharp> = {
    ".png": () => pipeline.png(),
    ".webp": () => pipeline.webp({ quality: 92 }),
    ".avif": () => pipeline.avif({ quality: 70 }),
  };
  const encoded = (encoders[ext] ?? (() => pipeline.jpeg({ quality: 92 })))();
  await encoded.toFile(file);
  const { width, height } = await sharp(flat).metadata();
  console.log(`${file}: flattened to ${width}×${height} (original kept in ${original})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
