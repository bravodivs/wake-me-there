import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { GEOFENCE_TASK } from "../constants";
import {
  getActiveTrip,
  markArrivalHandled,
  updateActiveTrip,
} from "../storage/tripStore";
import {
  scheduleArrivalAlerts,
  setupNotifications,
} from "../services/notificationService";

type GeofenceData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

/**
 * Headless geofence handler. Runs without any mounted React UI, so it must be
 * self contained: read persisted trip, de-duplicate the enter event, then fire
 * the arrival alert burst.
 */
export async function handleGeofenceEvent(
  data: GeofenceData | null,
  error: TaskManager.TaskManagerError | null,
): Promise<void> {
  if (error || !data) {
    return;
  }
  if (data.eventType !== Location.GeofencingEventType.Enter) {
    return;
  }

  const trip = await getActiveTrip();
  if (!trip || trip.arrivedAt) {
    return;
  }
  // Ignore events for a stale region id.
  if (data.region?.identifier && data.region.identifier !== trip.id) {
    return;
  }

  // De-duplicate: only the first handler for this trip fires alerts.
  const isFirst = await markArrivalHandled(trip.id);
  if (!isFirst) {
    return;
  }

  await updateActiveTrip({ arrivedAt: Date.now() });
  await setupNotifications();
  await scheduleArrivalAlerts(trip);
}

// Define the task at module scope so it exists before geofencing starts and can
// be invoked when the OS relaunches the app in the background.
if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask<GeofenceData>(GEOFENCE_TASK, ({ data, error }) =>
    handleGeofenceEvent(data ?? null, error ?? null),
  );
}
