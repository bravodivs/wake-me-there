jest.mock("expo-task-manager", () => ({
  __esModule: true,
  isTaskDefined: jest.fn(() => true),
  defineTask: jest.fn(),
}));

jest.mock("expo-location", () => ({
  __esModule: true,
  GeofencingEventType: { Enter: 1, Exit: 2 },
}));

jest.mock("../src/services/notificationService", () => ({
  __esModule: true,
  setupNotifications: jest.fn(() => Promise.resolve()),
  scheduleArrivalAlerts: jest.fn(() => Promise.resolve(["a"])),
}));

import { handleGeofenceEvent } from "../src/background/arrivalTask";
import {
  getActiveTrip,
  setActiveTrip,
} from "../src/storage/tripStore";
const { scheduleArrivalAlerts } = require("../src/services/notificationService");

const trip = {
  id: "trip-1",
  label: "Central Station",
  destination: { latitude: 1, longitude: 2 },
  radiusMeters: 500,
  createdAt: 0,
  arrivedAt: null,
};

const enter = { eventType: 1 as const, region: { identifier: "trip-1" } as any };

describe("handleGeofenceEvent", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await setActiveTrip(trip);
  });

  it("ignores errors", async () => {
    await handleGeofenceEvent(null, { code: "x", message: "boom" });
    expect(scheduleArrivalAlerts).not.toHaveBeenCalled();
  });

  it("ignores exit events", async () => {
    await handleGeofenceEvent({ eventType: 2 as any, region: {} as any }, null);
    expect(scheduleArrivalAlerts).not.toHaveBeenCalled();
  });

  it("ignores events for a stale region id", async () => {
    await handleGeofenceEvent(
      { eventType: 1 as any, region: { identifier: "other" } as any },
      null,
    );
    expect(scheduleArrivalAlerts).not.toHaveBeenCalled();
  });

  it("fires alerts once and marks the trip arrived", async () => {
    await handleGeofenceEvent(enter, null);
    expect(scheduleArrivalAlerts).toHaveBeenCalledTimes(1);
    const stored = await getActiveTrip();
    expect(stored?.arrivedAt).toEqual(expect.any(Number));
  });

  it("de-duplicates repeated enter events", async () => {
    await handleGeofenceEvent(enter, null);
    await handleGeofenceEvent(enter, null);
    await handleGeofenceEvent(enter, null);
    expect(scheduleArrivalAlerts).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no active trip", async () => {
    const { clearActiveTrip } = require("../src/storage/tripStore");
    await clearActiveTrip();
    await handleGeofenceEvent(enter, null);
    expect(scheduleArrivalAlerts).not.toHaveBeenCalled();
  });
});
