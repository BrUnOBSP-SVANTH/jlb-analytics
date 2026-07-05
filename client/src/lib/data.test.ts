/**
 * Unit tests — JLB Analytics
 * Fase 5: lib/data.ts functions
 *
 * Run with: pnpm test
 */

import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  sanitizePositiveNumber,
  calculateCorrelation,
} from "./data";

// ─── formatCurrency ────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats BRL correctly", () => {
    const result = formatCurrency(1234.56, "BRL");
    expect(result).toContain("1.234");
    expect(result).toContain("56");
  });

  it("formats USD correctly", () => {
    const result = formatCurrency(1234.56, "USD");
    expect(result).toContain("1,234");
  });

  it("defaults to BRL", () => {
    const result = formatCurrency(100);
    expect(result).toContain("100");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBeTruthy();
  });
});

// ─── formatPercent ─────────────────────────────────────────────────────────

describe("formatPercent", () => {
  it("adds + sign for positive values", () => {
    expect(formatPercent(5.25)).toBe("+5.25%");
  });

  it("uses - sign for negative values", () => {
    expect(formatPercent(-3.1)).toBe("-3.10%");
  });

  it("handles zero", () => {
    expect(formatPercent(0)).toBe("+0.00%");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatPercent(1.999)).toBe("+2.00%");
  });
});

// ─── formatNumber ──────────────────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats millions with M suffix", () => {
    expect(formatNumber(1_500_000)).toBe("1.5M");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(2500)).toBe("2.5K");
  });

  it("returns decimals for small numbers", () => {
    expect(formatNumber(42.5)).toBe("42.50");
  });

  it("handles exactly 1000", () => {
    expect(formatNumber(1000)).toBe("1.0K");
  });
});

// ─── sanitizePositiveNumber ────────────────────────────────────────────────

describe("sanitizePositiveNumber", () => {
  it("returns the value when positive", () => {
    expect(sanitizePositiveNumber(100)).toBe(100);
  });

  it("returns fallback for NaN", () => {
    expect(sanitizePositiveNumber(NaN, 0)).toBe(0);
  });

  it("returns fallback for negative", () => {
    expect(sanitizePositiveNumber(-5, 0)).toBe(0);
  });

  it("returns fallback for Infinity", () => {
    expect(sanitizePositiveNumber(Infinity, 0)).toBe(0);
  });

  it("allows zero", () => {
    expect(sanitizePositiveNumber(0)).toBe(0);
  });

  it("uses custom fallback", () => {
    expect(sanitizePositiveNumber(-1, 999)).toBe(999);
  });
});

// ─── calculateCorrelation ──────────────────────────────────────────────────

describe("calculateCorrelation", () => {
  it("returns 1 for identical arrays", () => {
    const x = [1, 2, 3, 4, 5];
    const { correlation } = calculateCorrelation(x, x);
    expect(correlation).toBeCloseTo(1, 3);
  });

  it("returns -1 for perfectly inverse arrays", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 4, 3, 2, 1];
    const { correlation } = calculateCorrelation(x, y);
    expect(correlation).toBeCloseTo(-1, 3);
  });

  it("returns near-0 for uncorrelated arrays", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 1, 4, 1, 5];
    const { correlation } = calculateCorrelation(x, y);
    expect(Math.abs(correlation)).toBeLessThan(0.5);
  });

  it("uses Bessel's correction (n-1 divisor)", () => {
    const x = [2, 4, 4, 4, 5, 5, 7, 9];
    const y = [2, 4, 4, 4, 5, 5, 7, 9];
    // With Bessel's correction, std = 2 for this dataset
    const { correlation } = calculateCorrelation(x, [...y]);
    expect(correlation).toBeCloseTo(1, 3);
  });

  it("sets lengthsMatch=false when arrays differ in size", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 2, 3];
    const { lengthsMatch, n } = calculateCorrelation(x, y);
    expect(lengthsMatch).toBe(false);
    expect(n).toBe(3); // uses minimum length
  });

  it("sets lengthsMatch=true when arrays are equal length", () => {
    const x = [1, 2, 3];
    const y = [4, 5, 6];
    const { lengthsMatch } = calculateCorrelation(x, y);
    expect(lengthsMatch).toBe(true);
  });

  it("handles n < 2 gracefully", () => {
    const { correlation, n } = calculateCorrelation([1], [2]);
    expect(correlation).toBe(0);
    expect(n).toBe(1);
  });

  it("returns 0 correlation for zero-variance arrays", () => {
    const x = [5, 5, 5, 5];
    const y = [1, 2, 3, 4];
    const { correlation } = calculateCorrelation(x, y);
    expect(correlation).toBe(0);
  });

  it("correlation is within [-1, 1]", () => {
    const x = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const y = [15, 25, 10, 45, 55, 35, 75, 85, 80, 105];
    const { correlation } = calculateCorrelation(x, y);
    expect(correlation).toBeGreaterThanOrEqual(-1);
    expect(correlation).toBeLessThanOrEqual(1);
  });
});
