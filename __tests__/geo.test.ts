import {
  distanceMeters,
  formatDistance,
  formatPercent,
  isValidCoordinate,
  journeyProgress,
  validateRadius,
} from "../src/utils/geo";
import { MAX_RADIUS_METERS, MIN_RADIUS_METERS } from "../src/constants";

describe("distanceMeters", () => {
  it("returns 0 for identical points", () => {
    const p = { latitude: 12.9716, longitude: 77.5946 };
    expect(distanceMeters(p, p)).toBe(0);
  });

  it("approximates a known short distance", () => {
    // ~1.11 km per 0.01 deg latitude near the equator.
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0.01, longitude: 0 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
  });

  it("is symmetric", () => {
    const a = { latitude: 28.6139, longitude: 77.209 };
    const b = { latitude: 19.076, longitude: 72.8777 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 3);
  });
});

describe("isValidCoordinate", () => {
  it("accepts valid coordinates", () => {
    expect(isValidCoordinate({ latitude: 10, longitude: 20 })).toBe(true);
  });

  it("rejects out-of-range and malformed values", () => {
    expect(isValidCoordinate({ latitude: 200, longitude: 20 })).toBe(false);
    expect(isValidCoordinate({ latitude: 10, longitude: 500 })).toBe(false);
    expect(isValidCoordinate({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(isValidCoordinate(null)).toBe(false);
    expect(isValidCoordinate("nope")).toBe(false);
  });
});

describe("validateRadius", () => {
  it("accepts values within bounds and rounds them", () => {
    expect(validateRadius(499.6)).toEqual({ ok: true, radiusMeters: 500 });
    expect(validateRadius(MIN_RADIUS_METERS)).toEqual({
      ok: true,
      radiusMeters: MIN_RADIUS_METERS,
    });
    expect(validateRadius(MAX_RADIUS_METERS)).toEqual({
      ok: true,
      radiusMeters: MAX_RADIUS_METERS,
    });
  });

  it("rejects values below the minimum", () => {
    const result = validateRadius(MIN_RADIUS_METERS - 1);
    expect(result.ok).toBe(false);
  });

  it("rejects values above the maximum", () => {
    const result = validateRadius(MAX_RADIUS_METERS + 1);
    expect(result.ok).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(validateRadius(NaN).ok).toBe(false);
    expect(validateRadius(Infinity).ok).toBe(false);
  });
});

describe("formatDistance", () => {
  it("uses meters below 1 km", () => {
    expect(formatDistance(250)).toBe("250 m");
  });

  it("uses km above 1 km", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(15000)).toBe("15 km");
  });

  it("handles invalid input", () => {
    expect(formatDistance(NaN)).toBe("--");
  });
});

describe("journeyProgress", () => {
  it("is 0 at the start and 1 at the arrival radius", () => {
    // start 1000 m away, radius 100 m -> coverable distance is 900 m.
    expect(journeyProgress(1000, 1000, 100)).toBeCloseTo(0, 5);
    expect(journeyProgress(1000, 100, 100)).toBeCloseTo(1, 5);
  });

  it("reports 85% correctly", () => {
    // covered 765 of 900 coverable meters => 0.85; current = 1000 - 765 = 235.
    expect(journeyProgress(1000, 235, 100)).toBeCloseTo(0.85, 5);
  });

  it("clamps outside the range", () => {
    expect(journeyProgress(1000, 2000, 100)).toBe(0);
    expect(journeyProgress(1000, 0, 100)).toBe(1);
  });

  it("returns 1 when already within the radius at start", () => {
    expect(journeyProgress(50, 40, 100)).toBe(1);
  });

  it("returns 0 when the start distance is unknown", () => {
    expect(journeyProgress(null, 500, 100)).toBe(0);
    expect(journeyProgress(undefined, 500, 100)).toBe(0);
  });
});

describe("formatPercent", () => {
  it("formats fractions as whole percentages", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.85)).toBe("85%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("clamps and handles invalid input", () => {
    expect(formatPercent(1.5)).toBe("100%");
    expect(formatPercent(-1)).toBe("0%");
    expect(formatPercent(NaN)).toBe("0%");
  });
});
