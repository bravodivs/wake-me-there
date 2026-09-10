import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearActiveTrip,
  getActiveTrip,
  loadState,
  markArrivalHandled,
  setActiveTrip,
  updateActiveTrip,
} from "../src/storage/tripStore";
import { Trip } from "../src/types";

const sampleTrip: Trip = {
  id: "trip-1",
  label: "Central Station",
  destination: { latitude: 12.9, longitude: 77.6 },
  radiusMeters: 500,
  createdAt: 1000,
  arrivedAt: null,
};

describe("tripStore", () => {
  it("returns empty state when nothing is stored", async () => {
    expect(await getActiveTrip()).toBeNull();
    expect(await loadState()).toEqual({
      activeTrip: null,
      handledArrivalKeys: [],
    });
  });

  it("persists and reads back an active trip", async () => {
    await setActiveTrip(sampleTrip);
    expect(await getActiveTrip()).toEqual(sampleTrip);
  });

  it("resets arrival keys when a new trip is set", async () => {
    await setActiveTrip(sampleTrip);
    await markArrivalHandled("trip-1");
    await setActiveTrip({ ...sampleTrip, id: "trip-2" });
    const state = await loadState();
    expect(state.handledArrivalKeys).toEqual([]);
  });

  it("updates fields on the active trip", async () => {
    await setActiveTrip(sampleTrip);
    const updated = await updateActiveTrip({ arrivedAt: 2000 });
    expect(updated?.arrivedAt).toBe(2000);
    expect((await getActiveTrip())?.arrivedAt).toBe(2000);
  });

  it("does nothing when updating with no active trip", async () => {
    expect(await updateActiveTrip({ arrivedAt: 5 })).toBeNull();
  });

  it("clears the active trip", async () => {
    await setActiveTrip(sampleTrip);
    await clearActiveTrip();
    expect(await getActiveTrip()).toBeNull();
  });

  it("de-duplicates arrival handling", async () => {
    await setActiveTrip(sampleTrip);
    expect(await markArrivalHandled("trip-1")).toBe(true);
    expect(await markArrivalHandled("trip-1")).toBe(false);
    expect(await markArrivalHandled("trip-1")).toBe(false);
  });

  it("recovers from corrupt stored data", async () => {
    await AsyncStorage.setItem("wake-me-there/state/v1", "{not json");
    expect(await loadState()).toEqual({
      activeTrip: null,
      handledArrivalKeys: [],
    });
  });

  it("drops an invalid persisted trip", async () => {
    await AsyncStorage.setItem(
      "wake-me-there/state/v1",
      JSON.stringify({ activeTrip: { id: "x" }, handledArrivalKeys: ["a"] }),
    );
    const state = await loadState();
    expect(state.activeTrip).toBeNull();
    expect(state.handledArrivalKeys).toEqual(["a"]);
  });
});
