import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { PermissionSnapshot } from "../types";

/**
 * Read the current permission state without prompting. Used to render health
 * indicators and to decide whether monitoring can run.
 */
export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [foreground, background, notifications, servicesEnabled] =
    await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
    ]);

  return {
    foregroundGranted: foreground.status === "granted",
    backgroundGranted: background.status === "granted",
    notificationsGranted:
      notifications.granted ||
      notifications.ios?.status ===
        Notifications.IosAuthorizationStatus.PROVISIONAL,
    locationServicesEnabled: servicesEnabled,
  };
}

/**
 * Request foreground location. Must be granted before background can be
 * requested on both platforms.
 */
export async function requestForegroundLocation(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

/**
 * Request background ("Always") location. Requires foreground to already be
 * granted. On Android 11+ / iOS this may route the user to Settings.
 */
export async function requestBackgroundLocation(): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return false;
  }
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === "granted";
}

export async function requestNotifications(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: true,
    },
  });
  return status === "granted";
}

/**
 * Whether the app currently has everything it needs to monitor a geofence and
 * alert the user in the background.
 */
export function canMonitor(snapshot: PermissionSnapshot): boolean {
  return (
    snapshot.foregroundGranted &&
    snapshot.backgroundGranted &&
    snapshot.notificationsGranted &&
    snapshot.locationServicesEnabled
  );
}
