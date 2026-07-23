import { describe, it, expect } from "vitest";
import { calculateWage, calculateIrrPrice } from "../services/subscription.service.js";

describe("calculateWage", () => {
  const conditions = [
    { element: "price", from: 1, to: 21, value: 1, wage_type: "fixed" as const },
    { element: "price", from: 21, to: 1501, value: 6, wage_type: "percent" as const },
    { element: "price", from: 1501, to: 990001, value: 5, wage_type: "percent" as const },
  ];

  it("applies fixed wage for USD values up to 21", () => {
    expect(calculateWage(12, conditions)).toBe(1);
    expect(calculateWage(20, conditions)).toBe(1);
  });

  it("applies 6% wage for mid USD values", () => {
    expect(calculateWage(22, conditions)).toBe(1.32);
    expect(calculateWage(100, conditions)).toBe(6);
  });

  it("applies 5% wage for high USD values", () => {
    expect(calculateWage(2000, conditions)).toBe(100);
  });
});

describe("calculateIrrPrice", () => {
  const conditions = [
    { element: "price", from: 1, to: 21, value: 1, wage_type: "fixed" as const },
    { element: "price", from: 21, to: 1501, value: 6, wage_type: "percent" as const },
  ];

  it("calculates IRR price with fixed wage tier", () => {
    const price = calculateIrrPrice(12, 1825000, conditions);
    expect(price).toBe(Math.round(13 * 1825000));
  });

  it("calculates IRR price with percent wage tier", () => {
    const price = calculateIrrPrice(22, 1825000, conditions);
    expect(price).toBe(Math.round(23.32 * 1825000));
  });
});
