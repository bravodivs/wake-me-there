export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Trip = {
  /** Stable id reused as the geofence region identifier. */
  id: string;
  /** Human readable label for the destination (address or coordinates). */
  label: string;
  destination: Coordinate;
  /** Alert radius in meters. */
  radiusMeters: number;
  createdAt: number;
  /** Set once the arrival geofence has fired and been handled. */
  arrivedAt: number | null;
  /**
   * Distance (meters) from where the trip started to the destination, captured
   * at start. Used to compute journey progress. Null if it couldn't be read.
   */
  startDistanceMeters?: number | null;
  /** Set when the one-time "almost there" (85%) nudge has fired. */
  almostThereAt?: number | null;
  /** Set when the user has acknowledged/dismissed the arrival alerts. */
  dismissedAt?: number | null;
};

export type PersistedState = {
  activeTrip: Trip | null;
  /**
   * Ids of geofence enter events already handled. Used to de-duplicate the
   * repeated enter callbacks the OS can deliver for a single crossing.
   */
  handledArrivalKeys: string[];
};

export type PermissionSnapshot = {
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  notificationsGranted: boolean;
  locationServicesEnabled: boolean;
};
