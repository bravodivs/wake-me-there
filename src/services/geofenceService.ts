import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { GEOFENCE_TASK } from "../constants";
import { Coordinate, Trip } from "../types";
import {
  clearActiveTrip,
  getActiveTrip,
  setActiveTrip,
  updateActiveTrip,
} from "../storage/tripStore";
import { cancelArrivalAlerts, setupNotifications } from "./notificationService";
import { canMonitor, getPermissionSnapshot } from "./permissionsService";
import { distanceMeters } from "../utils/geo";
// Import for its side effect: defines the geofencing task at module scope.
import "../background/arrivalTask";

export type MonitorHealth =
  | "monitoring"
  | "missing-permissions"
  | "location-services-off"
  | "arrived"
  | "idle";

function toRegion(trip: Trip): Location.LocationRegion {
  return {
    identifier: trip.id,
    latitude: trip.destination.latitude,
    longitude: trip.destination.longitude,
    radius: trip.radiusMeters,
    notifyOnEnter: true,
    notifyOnExit: false,
  };
}

/**
 * Best-effort read of the user's current position to record how far the trip is
 * at the start (used for progress). Never throws; returns null on failure.
 */
async function readCurrentCoordinate(): Promise<Coordinate | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return {
        latitude: last.coords.latitude,
        longitude: last.coords.longitude,
      };
    }
  } catch {
    // fall through to a fresh fix
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function isMonitoring(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

async function stopGeofencing(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {
    // Nothing was running; ignore.
  }
}

/**
 * Persist the trip and (re)register a single-region geofence for it. Returns the
 * resulting monitoring health so the UI can surface problems.
 */
export async function startTripMonitoring(trip: Trip): Promise<MonitorHealth> {
  // Capture the journey's starting distance for progress reporting.
  let startDistanceMeters = trip.startDistanceMeters ?? null;
  if (startDistanceMeters == null) {
    const origin = await readCurrentCoordinate();
    if (origin) {
      startDistanceMeters = distanceMeters(origin, trip.destination);
    }
  }

  await setActiveTrip({ ...trip, startDistanceMeters });
  await setupNotifications();

  const snapshot = await getPermissionSnapshot();
  if (!snapshot.locationServicesEnabled) {
    return "location-services-off";
  }
  if (!canMonitor(snapshot)) {
    return "missing-permissions";
  }

  // Replace any previously monitored region with just this trip's region.
  await stopGeofencing();
  await Location.startGeofencingAsync(GEOFENCE_TASK, [toRegion(trip)]);
  return "monitoring";
}

/**
 * Stop monitoring entirely: cancel alerts, stop the geofence and clear the trip.
 */
export async function stopTripMonitoring(): Promise<void> {
  await cancelArrivalAlerts();
  await stopGeofencing();
  await clearActiveTrip();
}

/**
 * Acknowledge arrival: cancel any pending/delivered alerts and record the
 * dismissal so nothing keeps nagging the user. The trip stays active (in an
 * arrived+dismissed state) until they explicitly finish it, so re-entry won't
 * re-trigger alerts.
 */
export async function dismissArrivalAlerts(): Promise<void> {
  await cancelArrivalAlerts();
  await updateActiveTrip({ dismissedAt: Date.now() });
}

/**
 * Reconcile persisted state with the OS on launch/foreground. If there is an
 * active, not-yet-arrived trip and we still have permission, make sure the
 * native geofence is actually registered (it may be lost after reboot). Returns
 * the current health for display.
 */
export async function reconcileMonitoring(): Promise<MonitorHealth> {
  const trip = await getActiveTrip();
  if (!trip) {
    return "idle";
  }
  if (trip.arrivedAt) {
    return "arrived";
  }

  await setupNotifications();

  const snapshot = await getPermissionSnapshot();
  if (!snapshot.locationServicesEnabled) {
    return "location-services-off";
  }
  if (!canMonitor(snapshot)) {
    return "missing-permissions";
  }

  if (!(await isMonitoring())) {
    await Location.startGeofencingAsync(GEOFENCE_TASK, [toRegion(trip)]);
  }
  return "monitoring";
}
