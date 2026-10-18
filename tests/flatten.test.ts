import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { apply, flatSize, flatten, homography, type Quad } from "../scripts/flatten";

describe("homography", () => {
  const square: Quad = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const tilted: Quad = [
    [12, 8],
    [95, 20],
    [90, 110],
    [5, 96],
  ];

  test("takes each corner to its partner", () => {
    const h = homography(square, tilted);
    for (let i = 0; i < 4; i++) {
      const [x, y] = apply(h, square[i]);
      expect(x).toBeCloseTo(tilted[i][0], 6);
      expect(y).toBeCloseTo(tilted[i][1], 6);
    }
  });

  test("refuses corners that all lie on a line", () => {
    expect(() =>
      homography(square, [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ).toThrow();
  });
});

describe("flatten", () => {
  test("sizes the result from the longer of each pair of sides", () => {
    expect(
      flatSize([
        [0, 0],
        [200, 10],
        [210, 300],
        [5, 290],
      ]),
    ).toEqual({ width: 205, height: 290 });
  });

  test("turns a tilted red square on white into a flat red image", async () => {
    // A red quadrilateral drawn on a white photo.
    const corners: Quad = [
      [40, 30],
      [250, 50],
      [240, 260],
      [30, 240],
    ];
    const svg = `<svg width="300" height="300"><rect width="300" height="300" fill="#fff"/>
      <polygon points="${corners.map((p) => p.join(",")).join(" ")}" fill="#f00"/></svg>`;
    const photo = await sharp(Buffer.from(svg)).png().toBuffer();
    const flat = await flatten(photo, corners);
    const { data, info } = await sharp(flat).raw().toBuffer({ resolveWithObject: true });
    // Away from the anti-aliased edge, every pixel is red.
    for (const [x, y] of [
      [3, 3],
      [info.width - 4, 3],
      [info.width - 4, info.height - 4],
      [3, info.height - 4],
      [info.width >> 1, info.height >> 1],
    ]) {
      const i = (y * info.width + x) * info.channels;
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 0, 0]);
    }
  });
});
