import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { Trip } from "../src/types";
import {
  distanceMeters,
  formatDistance,
  formatPercent,
  journeyProgress,
} from "../src/utils/geo";
import {
  ALMOST_THERE_THRESHOLD,
  FOREGROUND_ALARM_INTERVAL_MS,
  FOREGROUND_ALARM_MAX_PULSES,
  GENTLE_VIBRATION_PATTERN,
} from "../src/constants";
import {
  MonitorHealth,
  dismissArrivalAlerts,
  reconcileMonitoring,
  stopTripMonitoring,
} from "../src/services/geofenceService";
import { cancelArrivalAlerts } from "../src/services/notificationService";
import { getActiveTrip, updateActiveTrip } from "../src/storage/tripStore";

const HEALTH_COPY: Record<MonitorHealth, { title: string; tone: "ok" | "warn" }> =
  {
    monitoring: { title: "Monitoring your arrival", tone: "ok" },
    "missing-permissions": {
      title: "Permissions missing — arrival may not fire",
      tone: "warn",
    },
    "location-services-off": {
      title: "Location services are off",
      tone: "warn",
    },
    arrived: { title: "You've arrived", tone: "ok" },
    idle: { title: "No active trip", tone: "warn" },
  };

export default function TripScreen() {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [health, setHealth] = useState<MonitorHealth>("idle");
  const [distance, setDistance] = useState<number | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [almostThere, setAlmostThere] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [stopping, setStopping] = useState(false);

  const watcher = useRef<Location.LocationSubscription | null>(null);
  const alarmInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const tripRef = useRef<Trip | null>(null);
  const arrivedRef = useRef(false);
  const dismissedRef = useRef(false);

  const stopAlarm = useCallback(() => {
    Vibration.cancel();
    if (alarmInterval.current) {
      clearInterval(alarmInterval.current);
      alarmInterval.current = null;
    }
  }, []);

  const startAlarm = useCallback(() => {
    if (alarmInterval.current) {
      return;
    }
    // Gentle, bounded pulses — not a continuous siren.
    Vibration.vibrate(GENTLE_VIBRATION_PATTERN);
    let pulses = 1;
    alarmInterval.current = setInterval(() => {
      if (pulses >= FOREGROUND_ALARM_MAX_PULSES) {
        stopAlarm();
        return;
      }
      Vibration.vibrate(GENTLE_VIBRATION_PATTERN);
      pulses += 1;
    }, FOREGROUND_ALARM_INTERVAL_MS);
  }, [stopAlarm]);

  const enterArrivedState = useCallback(async () => {
    if (arrivedRef.current) {
      return;
    }
    arrivedRef.current = true;
    setArrived(true);
    setProgress(1);

    if (tripRef.current && !tripRef.current.arrivedAt) {
      const arrivedAt = Date.now();
      tripRef.current = { ...tripRef.current, arrivedAt };
      await updateActiveTrip({ arrivedAt });
    }

    if (dismissedRef.current) {
      return;
    }
    // Foreground takes over alerting: silence the background notification burst
    // so the user isn't buzzed twice, then run the gentle in-app alarm.
    await cancelArrivalAlerts();
    startAlarm();
  }, [startAlarm]);

  const onNewPosition = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      const current = tripRef.current;
      if (!current) {
        return;
      }
      const d = distanceMeters(current.destination, coords);
      setDistance(d);

      // Lazily establish the start distance if it wasn't captured at start.
      let start = current.startDistanceMeters ?? null;
      if (start == null) {
        start = d;
        tripRef.current = { ...current, startDistanceMeters: d };
        updateActiveTrip({ startDistanceMeters: d });
      }

      const p = journeyProgress(start, d, current.radiusMeters);
      setProgress(p);

      // One-time gentle "almost there" nudge at 85%.
      if (
        p >= ALMOST_THERE_THRESHOLD &&
        !tripRef.current?.almostThereAt &&
        !arrivedRef.current
      ) {
        Vibration.vibrate(GENTLE_VIBRATION_PATTERN);
        const almostThereAt = Date.now();
        tripRef.current = tripRef.current
          ? { ...tripRef.current, almostThereAt }
          : tripRef.current;
        updateActiveTrip({ almostThereAt });
        setAlmostThere(true);
      }

      if (d <= current.radiusMeters) {
        enterArrivedState();
      }
    },
    [enterArrivedState],
  );

  const loadTrip = useCallback(async () => {
    const current = await getActiveTrip();
    if (!current) {
      router.replace("/");
      return null;
    }
    tripRef.current = current;
    arrivedRef.current = Boolean(current.arrivedAt);
    dismissedRef.current = Boolean(current.dismissedAt);
    setTrip(current);
    setArrived(Boolean(current.arrivedAt));
    setDismissed(Boolean(current.dismissedAt));
    setAlmostThere(Boolean(current.almostThereAt));
    return current;
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const current = await loadTrip();
        if (!active || !current) {
          return;
        }
        const status = await reconcileMonitoring();
        if (active) {
          setHealth(status);
        }
        // Already arrived (e.g. background geofence fired) and not dismissed:
        // resume the gentle alarm now that we're on screen.
        if (current.arrivedAt && !current.dismissedAt) {
          startAlarm();
        }
        try {
          watcher.current = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
            (pos) =>
              onNewPosition({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
          );
        } catch {
          // Foreground distance is a nice-to-have; ignore if unavailable.
        }
      })();
      return () => {
        active = false;
        watcher.current?.remove();
        watcher.current = null;
        stopAlarm();
      };
    }, [loadTrip, onNewPosition, startAlarm, stopAlarm]),
  );

  useEffect(() => {
    return () => {
      watcher.current?.remove();
      stopAlarm();
    };
  }, [stopAlarm]);

  const onDismiss = useCallback(async () => {
    stopAlarm();
    dismissedRef.current = true;
    setDismissed(true);
    await dismissArrivalAlerts();
    if (tripRef.current) {
      tripRef.current = { ...tripRef.current, dismissedAt: Date.now() };
    }
  }, [stopAlarm]);

  const onStop = useCallback(async () => {
    setStopping(true);
    stopAlarm();
    try {
      await stopTripMonitoring();
      router.replace("/");
    } finally {
      setStopping(false);
    }
  }, [router, stopAlarm]);

  if (!trip) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#38BDF8" />
      </View>
    );
  }

  const healthInfo = HEALTH_COPY[arrived ? "arrived" : health];
  const progressPct = formatPercent(progress);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>DESTINATION</Text>
        <Text style={styles.destination}>{trip.label}</Text>
        <Text style={styles.meta}>
          Alert radius: {formatDistance(trip.radiusMeters)}
        </Text>
      </View>

      {arrived ? (
        <View style={[styles.arrivedCard, dismissed && styles.arrivedCardMuted]}>
          <Text style={styles.arrivedTitle}>
            {dismissed ? "Arrived" : "You're here"}
          </Text>
          <Text style={styles.arrivedBody}>
            {dismissed
              ? `Alerts stopped for ${trip.label}. Finish the trip when you're done.`
              : `You've reached the alert zone for ${trip.label}.`}
          </Text>
        </View>
      ) : (
        <View style={styles.progressCard}>
          <Text style={styles.eyebrow}>PROGRESS</Text>
          <Text style={styles.progressValue}>{progressPct}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.meta}>
            {distance === null
              ? "Locating\u2026"
              : `${formatDistance(distance)} remaining`}
          </Text>
          {almostThere && (
            <Text style={styles.almostThere}>
              Almost there — get ready to stop.
            </Text>
          )}
          <Text style={styles.hint}>
            Progress updates while the app is open. Arrival is still detected in
            the background.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.healthRow,
          healthInfo.tone === "warn" ? styles.healthWarn : styles.healthOk,
        ]}
      >
        <Text style={styles.healthText}>{healthInfo.title}</Text>
      </View>

      <View style={styles.spacer} />

      {arrived && !dismissed && (
        <Pressable style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Dismiss alert</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.stopButton, stopping && styles.buttonDisabled]}
        onPress={onStop}
        disabled={stopping}
      >
        {stopping ? (
          <ActivityIndicator color="#F8FAFC" />
        ) : (
          <Text style={styles.stopButtonText}>
            {arrived ? "Finish trip" : "Stop monitoring"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1221", padding: 20, gap: 16 },
  centered: {
    flex: 1,
    backgroundColor: "#0B1221",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#111C33",
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  eyebrow: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  destination: { color: "#F8FAFC", fontSize: 22, fontWeight: "700" },
  meta: { color: "#94A3B8", fontSize: 14 },
  progressCard: {
    backgroundColor: "#111C33",
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  progressValue: { color: "#38BDF8", fontSize: 44, fontWeight: "800" },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1E293B",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#38BDF8",
  },
  almostThere: { color: "#FBBF24", fontSize: 15, fontWeight: "700" },
  hint: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  arrivedCard: {
    backgroundColor: "#7F1D1D",
    borderRadius: 16,
    padding: 24,
    gap: 8,
  },
  arrivedCardMuted: { backgroundColor: "#3F2937" },
  arrivedTitle: { color: "#FEE2E2", fontSize: 28, fontWeight: "800" },
  arrivedBody: { color: "#FECACA", fontSize: 15, lineHeight: 22 },
  healthRow: { borderRadius: 12, padding: 14 },
  healthOk: { backgroundColor: "#0F2A1E" },
  healthWarn: { backgroundColor: "#3A2410" },
  healthText: { color: "#E2E8F0", fontSize: 14, fontWeight: "600" },
  spacer: { flex: 1 },
  dismissButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  dismissButtonText: { color: "#0B1221", fontSize: 17, fontWeight: "700" },
  stopButton: {
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  stopButtonText: { color: "#F8FAFC", fontSize: 17, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
});
