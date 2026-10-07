import { Coordinate } from "../types";
import { MAX_RADIUS_METERS, MIN_RADIUS_METERS } from "../constants";

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates in meters (haversine).
 */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinate(value: unknown): value is Coordinate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const { latitude, longitude } = candidate;
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}
/**
 * Accepts "lat, lng", or "lat;lng"
 * Returns null when the text is not a coordinate pair
 */
export function parseCoordinateInput(text: string): Coordinate | null {
  const match = text
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  const coordinate = {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

export type RadiusValidation =
  | { ok: true; radiusMeters: number }
  | { ok: false; error: string };

/**
 * Clamp/validate a user-entered radius. Rejects non-finite values and enforces
 * the supported bounds so we never register an unusable geofence.
 */
export function validateRadius(radiusMeters: number): RadiusValidation {
  if (typeof radiusMeters !== "number" || !Number.isFinite(radiusMeters)) {
    return { ok: false, error: "Enter a radius in meters." };
  }
  const rounded = Math.round(radiusMeters);
  if (rounded < MIN_RADIUS_METERS) {
    return {
      ok: false,
      error: `Radius must be at least ${MIN_RADIUS_METERS} m for reliable detection.`,
    };
  }
  if (rounded > MAX_RADIUS_METERS) {
    return {
      ok: false,
      error: `Radius must be ${MAX_RADIUS_METERS} m or less.`,
    };
  }
  return { ok: true, radiusMeters: rounded };
}

/** Format a distance for display, switching to km above 1000 m. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) {
    return "--";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/** Format coordinates as a short human-readable label. */
export function formatCoordinate(coord: Coordinate): string {
  return `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`;
}

/**
 * Journey progress in the range 0..1, where 1 means the arrival radius has been
 * reached. Measured over the coverable distance (start distance minus radius),
 * so hitting the alert ring reads as 100%. Returns 1 if the start distance is
 * unknown-small (already at/inside the destination).
 */
export function journeyProgress(
  startDistanceMeters: number | null | undefined,
  currentDistanceMeters: number,
  radiusMeters: number,
): number {
  if (
    typeof startDistanceMeters !== "number" ||
    !Number.isFinite(startDistanceMeters) ||
    !Number.isFinite(currentDistanceMeters)
  ) {
    return 0;
  }
  const total = startDistanceMeters - radiusMeters;
  if (total <= 0) {
    return 1;
  }
  const covered = startDistanceMeters - currentDistanceMeters;
  return Math.max(0, Math.min(1, covered / total));
}

/** Format a 0..1 fraction as a whole-number percentage string. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) {
    return "0%";
  }
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
