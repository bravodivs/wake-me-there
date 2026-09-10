import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  ALERT_INTERVAL_SECONDS,
  ALERT_REPEAT_COUNT,
  ANDROID_VIBRATION_PATTERN,
  ARRIVAL_CATEGORY_ID,
  ARRIVAL_CHANNEL_ID,
  STOP_ACTION_ID,
} from "../constants";
import { Trip } from "../types";

let configured = false;

/**
 * Configure the foreground presentation handler, the Android alert channel and
 * the actionable "Stop" category. Safe to call multiple times.
 */
export async function setupNotifications(): Promise<void> {
  if (configured) {
    return;
  }
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  await Notifications.setNotificationCategoryAsync(ARRIVAL_CATEGORY_ID, [
    {
      identifier: STOP_ACTION_ID,
      buttonTitle: "Stop alerts",
      options: { opensAppToForeground: true, isDestructive: true },
    },
  ]);

  if (Platform.OS === "android") {
    // Channel sound/vibration/importance are immutable after creation; the
    // strong vibration pattern is baked in here.
    await Notifications.setNotificationChannelAsync(ARRIVAL_CHANNEL_ID, {
      name: "Arrival alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: ANDROID_VIBRATION_PATTERN,
      enableVibrate: true,
      sound: "default",
      bypassDnd: false,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

function buildContent(trip: Trip, index: number): Notifications.NotificationContentInput {
  const title = index === 0 ? "You're arriving" : "Still approaching";
  return {
    title,
    body: `You are near ${trip.label}. Time to get ready to stop.`,
    categoryIdentifier: ARRIVAL_CATEGORY_ID,
    sound: "default",
    // iOS: elevate above normal notifications (does not bypass silent mode).
    interruptionLevel: "timeSensitive",
    // Android: route through the high-importance vibrating channel.
    ...(Platform.OS === "android"
      ? { vibrate: ANDROID_VIBRATION_PATTERN }
      : {}),
    data: { tripId: trip.id, kind: "arrival" },
  };
}

/**
 * Fire the arrival alert burst: one immediate notification plus a bounded
 * series spaced one minute apart. Returns the scheduled identifiers.
 */
export async function scheduleArrivalAlerts(trip: Trip): Promise<string[]> {
  const ids: string[] = [];

  const immediate = await Notifications.scheduleNotificationAsync({
    content: buildContent(trip, 0),
    // Immediate delivery: null on iOS; a channel-aware trigger on Android so it
    // uses the high-importance vibrating channel.
    trigger:
      Platform.OS === "android" ? { channelId: ARRIVAL_CHANNEL_ID } : null,
  });
  ids.push(immediate);

  for (let i = 1; i <= ALERT_REPEAT_COUNT; i += 1) {
    const id = await Notifications.scheduleNotificationAsync({
      content: buildContent(trip, i),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: ALERT_INTERVAL_SECONDS * i,
        repeats: false,
        ...(Platform.OS === "android"
          ? { channelId: ARRIVAL_CHANNEL_ID }
          : {}),
      },
    });
    ids.push(id);
  }

  return ids;
}

/**
 * Cancel all pending arrival reminders and dismiss any already-delivered ones.
 * Called when the user taps "Stop" or the trip ends.
 */
export async function cancelArrivalAlerts(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}
