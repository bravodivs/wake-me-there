jest.mock("expo-location", () => ({
  __esModule: true,
  startGeofencingAsync: jest.fn(() => Promise.resolve()),
  stopGeofencingAsync: jest.fn(() => Promise.resolve()),
  hasStartedGeofencingAsync: jest.fn(() => Promise.resolve(false)),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve(null)),
  Accuracy: { Balanced: 3 },
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

jest.mock("expo-task-manager", () => ({
  __esModule: true,
  isTaskDefined: jest.fn(() => true),
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock("../src/services/permissionsService", () => ({
  __esModule: true,
  getPermissionSnapshot: jest.fn(),
  canMonitor: (s: any) =>
    s.foregroundGranted &&
    s.backgroundGranted &&
    s.notificationsGranted &&
    s.locationServicesEnabled,
}));

jest.mock("../src/services/notificationService", () => ({
  __esModule: true,
  setupNotifications: jest.fn(() => Promise.resolve()),
  cancelArrivalAlerts: jest.fn(() => Promise.resolve()),
}));

import * as Location from "expo-location";
import {
  dismissArrivalAlerts,
  reconcileMonitoring,
  startTripMonitoring,
  stopTripMonitoring,
} from "../src/services/geofenceService";
import { getPermissionSnapshot } from "../src/services/permissionsService";
import { cancelArrivalAlerts } from "../src/services/notificationService";
import {
  getActiveTrip,
  setActiveTrip,
  updateActiveTrip,
} from "../src/storage/tripStore";

const startGeofencing = Location.startGeofencingAsync as jest.Mock;
const stopGeofencing = Location.stopGeofencingAsync as jest.Mock;
const hasStartedGeofencing = Location.hasStartedGeofencingAsync as jest.Mock;
const getLastKnownPosition = Location.getLastKnownPositionAsync as jest.Mock;
const getSnapshot = getPermissionSnapshot as jest.Mock;
const cancelAlerts = cancelArrivalAlerts as jest.Mock;

const ALL_GRANTED = {
  foregroundGranted: true,
  backgroundGranted: true,
  notificationsGranted: true,
  locationServicesEnabled: true,
};

const trip = {
  id: "trip-1",
  label: "Central Station",
  destination: { latitude: 12.9, longitude: 77.6 },
  radiusMeters: 500,
  createdAt: 0,
  arrivedAt: null,
};

describe("geofenceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasStartedGeofencing.mockResolvedValue(false);
    getLastKnownPosition.mockResolvedValue(null);
  });

  describe("startTripMonitoring", () => {
    it("persists the trip and registers a single region when allowed", async () => {
      getSnapshot.mockResolvedValue(ALL_GRANTED);
      const health = await startTripMonitoring(trip);

      expect(health).toBe("monitoring");
      expect(await getActiveTrip()).toMatchObject({ id: "trip-1" });
      expect(startGeofencing).toHaveBeenCalledWith(expect.any(String), [
        expect.objectContaining({
          identifier: "trip-1",
          radius: 500,
          notifyOnEnter: true,
          notifyOnExit: false,
        }),
      ]);
    });

    it("reports when location services are off", async () => {
      getSnapshot.mockResolvedValue({
        ...ALL_GRANTED,
        locationServicesEnabled: false,
      });
      expect(await startTripMonitoring(trip)).toBe("location-services-off");
      expect(startGeofencing).not.toHaveBeenCalled();
    });

    it("reports missing permissions", async () => {
      getSnapshot.mockResolvedValue({
        ...ALL_GRANTED,
        backgroundGranted: false,
      });
      expect(await startTripMonitoring(trip)).toBe("missing-permissions");
      expect(startGeofencing).not.toHaveBeenCalled();
    });

    it("records the start distance from the current position", async () => {
      getSnapshot.mockResolvedValue(ALL_GRANTED);
      // ~157 m south of the destination.
      getLastKnownPosition.mockResolvedValue({
        coords: { latitude: 12.8986, longitude: 77.6 },
      });
      await startTripMonitoring(trip);
      const stored = await getActiveTrip();
      expect(stored?.startDistanceMeters).toBeGreaterThan(100);
      expect(stored?.startDistanceMeters).toBeLessThan(250);
    });

    it("stores null start distance when position is unavailable", async () => {
      getSnapshot.mockResolvedValue(ALL_GRANTED);
      getLastKnownPosition.mockResolvedValue(null);
      await startTripMonitoring(trip);
      const stored = await getActiveTrip();
      expect(stored?.startDistanceMeters ?? null).toBeNull();
    });
  });

  describe("dismissArrivalAlerts", () => {
    it("cancels alerts and records the dismissal without clearing the trip", async () => {
      await setActiveTrip({ ...trip, arrivedAt: Date.now() });
      await dismissArrivalAlerts();

      expect(cancelAlerts).toHaveBeenCalledTimes(1);
      const stored = await getActiveTrip();
      expect(stored).not.toBeNull();
      expect(stored?.dismissedAt).toEqual(expect.any(Number));
    });
  });

  describe("stopTripMonitoring", () => {
    it("cancels alerts, stops geofencing and clears the trip", async () => {
      await setActiveTrip(trip);
      await stopTripMonitoring();

      expect(cancelAlerts).toHaveBeenCalledTimes(1);
      expect(stopGeofencing).toHaveBeenCalledTimes(1);
      expect(await getActiveTrip()).toBeNull();
    });
  });

  describe("reconcileMonitoring", () => {
    it("is idle with no trip", async () => {
      expect(await reconcileMonitoring()).toBe("idle");
    });

    it("reports arrived when the trip already arrived", async () => {
      await setActiveTrip(trip);
      await updateActiveTrip({ arrivedAt: 123 });
      expect(await reconcileMonitoring()).toBe("arrived");
    });

    it("re-registers the geofence when it is not running", async () => {
      await setActiveTrip(trip);
      getSnapshot.mockResolvedValue(ALL_GRANTED);
      hasStartedGeofencing.mockResolvedValue(false);

      expect(await reconcileMonitoring()).toBe("monitoring");
      expect(startGeofencing).toHaveBeenCalledTimes(1);
    });

    it("does not re-register when already monitoring", async () => {
      await setActiveTrip(trip);
      getSnapshot.mockResolvedValue(ALL_GRANTED);
      hasStartedGeofencing.mockResolvedValue(true);

      expect(await reconcileMonitoring()).toBe("monitoring");
      expect(startGeofencing).not.toHaveBeenCalled();
    });
  });
});
