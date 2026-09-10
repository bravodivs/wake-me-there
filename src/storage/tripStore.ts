import AsyncStorage from "@react-native-async-storage/async-storage";
import { PersistedState, Trip } from "../types";
import { isValidCoordinate } from "../utils/geo";

const STORAGE_KEY = "wake-me-there/state/v1";

const EMPTY_STATE: PersistedState = {
  activeTrip: null,
  handledArrivalKeys: [],
};

function isTrip(value: unknown): value is Trip {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.label === "string" &&
    typeof t.radiusMeters === "number" &&
    isValidCoordinate(t.destination) &&
    typeof t.createdAt === "number" &&
    (t.arrivedAt === null || typeof t.arrivedAt === "number")
  );
}

function normalize(raw: unknown): PersistedState {
  if (typeof raw !== "object" || raw === null) {
    return { ...EMPTY_STATE };
  }
  const parsed = raw as Record<string, unknown>;
  const activeTrip = isTrip(parsed.activeTrip) ? parsed.activeTrip : null;
  const handledArrivalKeys = Array.isArray(parsed.handledArrivalKeys)
    ? parsed.handledArrivalKeys.filter(
        (k): k is string => typeof k === "string",
      )
    : [];
  return { activeTrip, handledArrivalKeys };
}

/**
 * Read the persisted state. Always resolves to a valid object; corrupt data is
 * treated as an empty state so the app never crashes on load.
 */
export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_STATE };
    }
    return normalize(JSON.parse(raw));
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function saveState(state: PersistedState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function getActiveTrip(): Promise<Trip | null> {
  return (await loadState()).activeTrip;
}

/** Persist a new active trip and reset the arrival de-duplication set. */
export async function setActiveTrip(trip: Trip): Promise<void> {
  await saveState({ activeTrip: trip, handledArrivalKeys: [] });
}

/** Update fields on the active trip if one exists. */
export async function updateActiveTrip(
  patch: Partial<Trip>,
): Promise<Trip | null> {
  const state = await loadState();
  if (!state.activeTrip) {
    return null;
  }
  const updated: Trip = { ...state.activeTrip, ...patch };
  await saveState({ ...state, activeTrip: updated });
  return updated;
}

/** Remove the active trip and clear related state. */
export async function clearActiveTrip(): Promise<void> {
  await saveState({ ...EMPTY_STATE });
}

/**
 * Atomically record that an arrival key was handled. Returns true if this call
 * is the first to handle the key (i.e. the caller should fire alerts), false if
 * it was already handled. This is how we de-duplicate repeated enter events.
 */
export async function markArrivalHandled(key: string): Promise<boolean> {
  const state = await loadState();
  if (state.handledArrivalKeys.includes(key)) {
    return false;
  }
  await saveState({
    ...state,
    handledArrivalKeys: [...state.handledArrivalKeys, key],
  });
  return true;
}
