import { Platform } from "react-native";
import {
  ALERT_INTERVAL_SECONDS,
  ALERT_REPEAT_COUNT,
  ARRIVAL_CHANNEL_ID,
} from "../src/constants";

jest.mock("expo-notifications", () => {
  let counter = 0;
  return {
    __esModule: true,
    setNotificationHandler: jest.fn(),
    setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
    setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
    scheduleNotificationAsync: jest.fn(() => {
      counter += 1;
      return Promise.resolve(`id-${counter}`);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
    dismissAllNotificationsAsync: jest.fn(() => Promise.resolve()),
    AndroidImportance: { MAX: 5 },
    AndroidNotificationVisibility: { PUBLIC: 1 },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
  };
});

const trip = {
  id: "trip-1",
  label: "Central Station",
  destination: { latitude: 1, longitude: 2 },
  radiusMeters: 500,
  createdAt: 0,
  arrivedAt: null,
};

// Re-require both the mock and the service from a fresh module registry so the
// `configured` flag resets and both share the same mock instance.
function load(os: "ios" | "android") {
  jest.resetModules();
  (Platform as { OS: string }).OS = os;
  const Notifications = require("expo-notifications");
  const service = require("../src/services/notificationService");
  return { Notifications, service };
}

describe("notificationService", () => {
  it("schedules an immediate alert plus the repeat burst", async () => {
    const { Notifications, service } = load("ios");
    const ids = await service.scheduleArrivalAlerts(trip);

    expect(ids).toHaveLength(ALERT_REPEAT_COUNT + 1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(
      ALERT_REPEAT_COUNT + 1,
    );

    const calls = Notifications.scheduleNotificationAsync.mock.calls;
    expect(calls[0][0].trigger).toBeNull();
    expect(calls[1][0].trigger).toMatchObject({
      type: "timeInterval",
      seconds: ALERT_INTERVAL_SECONDS,
      repeats: false,
    });
    expect(calls[ALERT_REPEAT_COUNT][0].trigger.seconds).toBe(
      ALERT_INTERVAL_SECONDS * ALERT_REPEAT_COUNT,
    );
  });

  it("routes the immediate alert through the Android channel", async () => {
    const { Notifications, service } = load("android");
    await service.scheduleArrivalAlerts(trip);

    const first = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(first.trigger).toEqual({ channelId: ARRIVAL_CHANNEL_ID });
  });

  it("creates the Android channel and category during setup", async () => {
    const { Notifications, service } = load("android");
    await service.setupNotifications();

    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      ARRIVAL_CHANNEL_ID,
      expect.objectContaining({ importance: 5, enableVibrate: true }),
    );
  });

  it("does not create a channel on iOS", async () => {
    const { Notifications, service } = load("ios");
    await service.setupNotifications();

    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("cancels and dismisses on stop", async () => {
    const { Notifications, service } = load("ios");
    await service.cancelArrivalAlerts();

    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});
