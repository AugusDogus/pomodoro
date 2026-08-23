import { describe, expect, test } from "bun:test";
import { formatTime, progressFor, remainingFromEnd } from "./timer";

describe("timer helpers", () => {
  test("formats minutes and seconds", () => {
    expect(formatTime(1500)).toBe("25:00");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(-2)).toBe("00:00");
  });

  test("calculates remaining time without going negative", () => {
    expect(remainingFromEnd(12_000, 10_001)).toBe(2);
    expect(remainingFromEnd(10_000, 11_000)).toBe(0);
  });

  test("clamps progress between zero and one", () => {
    expect(progressFor(1500, 1500)).toBe(0);
    expect(progressFor(750, 1500)).toBe(0.5);
    expect(progressFor(-1, 1500)).toBe(1);
  });
});

