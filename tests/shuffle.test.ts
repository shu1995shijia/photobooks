import { describe, expect, test } from "vitest";
import { spinDelays } from "../src/scripts/carousel";
import { randomIndex, shuffled, stepDelay } from "../src/scripts/shuffle";

describe("randomIndex", () => {
  test("stays in range and avoids the one to skip", () => {
    for (let i = 0; i < 200; i++) {
      const n = randomIndex(5, 2);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      expect(n).not.toBe(2);
    }
  });

  test("has no choice with one book", () => {
    expect(randomIndex(1, 0)).toBe(0);
  });
});

describe("timing", () => {
  test("the flicker slows down", () => {
    const delays = Array.from({ length: 14 }, (_, i) => stepDelay(i));
    expect(delays[0]).toBe(45);
    expect(delays[13]).toBe(280);
    expect(delays.every((d, i) => i === 0 || d >= delays[i - 1])).toBe(true);
  });

  test("a spin takes the same time however far it goes, slowing down", () => {
    for (const steps of [8, 30, 79]) {
      const delays = spinDelays(steps, 2600);
      expect(delays).toHaveLength(steps);
      expect(delays.reduce((a, b) => a + b, 0)).toBeCloseTo(2600, 6);
      expect(delays[steps - 1]).toBeGreaterThan(delays[0]);
    }
  });
});

describe("shuffled", () => {
  test("keeps every item once, leaves the original alone, and does reorder", () => {
    const items = Array.from({ length: 74 }, (_, i) => i);
    const out = shuffled(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items[0]).toBe(0);
    // 74 items coming back in the same order would be a 1 in 74! chance.
    expect(out).not.toEqual(items);
  });
});
