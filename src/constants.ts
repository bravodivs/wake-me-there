/** Name of the geofencing task registered with expo-task-manager. */
export const GEOFENCE_TASK = "wake-me-there-arrival-geofence";

/** Android notification channel used for the strong arrival alert. */
export const ARRIVAL_CHANNEL_ID = "arrival-alerts";

/** Notification category that carries the "Stop alerts" action. */
export const ARRIVAL_CATEGORY_ID = "arrival";
export const STOP_ACTION_ID = "stop-arrival-alerts";

/**
 * Radius presets offered in the UI. OS geofencing is unreliable below ~200 m,
 * so that is the smallest option we expose.
 */
export const RADIUS_PRESETS_METERS = [200, 500, 1000, 2000] as const;

export const MIN_RADIUS_METERS = 100;
export const MAX_RADIUS_METERS = 50000;

/**
 * Background arrival alert burst. The OS will not let a normal app vibrate
 * continuously until dismissed, so we schedule an immediate alert plus a small,
 * deliberately restrained series of follow-ups spaced one minute apart (iOS
 * requires repeat intervals >= 60s). Kept short so it doesn't nag the user.
 */
export const ALERT_REPEAT_COUNT = 2;
export const ALERT_INTERVAL_SECONDS = 60;

/**
 * Strong Android vibration pattern in milliseconds: [wait, vibrate, wait, ...].
 * iOS does not expose a custom notification vibration pattern.
 */
export const ANDROID_VIBRATION_PATTERN = [
  0, 600, 300, 600, 300, 600, 300, 1000,
];

/**
 * Fraction of the journey (start -> arrival radius) after which we give a single
 * gentle "almost there" heads-up. Foreground only.
 */
export const ALMOST_THERE_THRESHOLD = 0.85;

/**
 * Gentle haptic pattern for the in-app "almost there" nudge and the foreground
 * arrival alarm. Softer than the background arrival pattern so it doesn't
 * startle someone who is driving or walking.
 */
export const GENTLE_VIBRATION_PATTERN = [0, 350, 200, 350];

/**
 * Foreground arrival alarm cadence: pulse the gentle pattern every few seconds
 * for a bounded number of pulses, or until the user dismisses. It does not loop
 * forever, by design.
 */
export const FOREGROUND_ALARM_INTERVAL_MS = 3000;
export const FOREGROUND_ALARM_MAX_PULSES = 10;
