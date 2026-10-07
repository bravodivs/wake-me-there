import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, {
  Circle,
  MapPressEvent,
  Marker,
  Region,
} from "react-native-maps";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { Coordinate, PermissionSnapshot, Trip } from "../src/types";
import { RADIUS_PRESETS_METERS } from "../src/constants";
import {
  formatCoordinate,
  formatDistance,
  isValidCoordinate,
  validateRadius,
} from "../src/utils/geo";
import {
  canMonitor,
  getPermissionSnapshot,
  requestBackgroundLocation,
  requestForegroundLocation,
  requestNotifications,
} from "../src/services/permissionsService";
import { startTripMonitoring } from "../src/services/geofenceService";
import { getActiveTrip } from "../src/storage/tripStore";
import { parseCoordinateInput } from "../src/utils/geo";

const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const EMPTY_PERMISSIONS: PermissionSnapshot = {
  foregroundGranted: false,
  backgroundGranted: false,
  notificationsGranted: false,
  locationServicesEnabled: false,
};

export default function DestinationScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [label, setLabel] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [radiusMeters, setRadiusMeters] = useState<number>(500);
  const [customRadius, setCustomRadius] = useState<string>("");
  const [permissions, setPermissions] =
    useState<PermissionSnapshot>(EMPTY_PERMISSIONS);
  const [geocoding, setGeocoding] = useState(false);
  const [starting, setStarting] = useState(false);

  const refreshPermissions = useCallback(async () => {
    setPermissions(await getPermissionSnapshot());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const trip = await getActiveTrip();
        if (active && trip && !trip.arrivedAt) {
          router.replace("/trip");
          return;
        }
        await refreshPermissions();
      })();
      return () => {
        active = false;
      };
    }, [refreshPermissions, router]),
  );

  useEffect(() => {
    (async () => {
      const snapshot = await getPermissionSnapshot();
      setPermissions(snapshot);
      if (snapshot.foregroundGranted && snapshot.locationServicesEnabled) {
        try {
          const pos = await Location.getLastKnownPositionAsync();
          if (pos) {
            setRegion((prev) => ({
              ...prev,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }));
          }
        } catch {
          // Keep default region.
        }
      }
    })();
  }, []);

  const moveTo = useCallback((coord: Coordinate) => {
    const next: Region = {
      latitude: coord.latitude,
      longitude: coord.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }, []);

  const setDestinationFromCoord = useCallback(
    async (coord: Coordinate, moveMap: boolean) => {
      setDestination(coord);
      setLabel(formatCoordinate(coord));
      if (moveMap) {
        moveTo(coord);
      }
      try {
        const results = await Location.reverseGeocodeAsync(coord);
        const first = results[0];
        if (first) {
          const parts = [
            first.name,
            first.street,
            first.city,
            first.region,
          ].filter(Boolean);
          if (parts.length > 0) {
            setLabel(parts.join(", "));
          }
        }
      } catch {
        // Keep coordinate label; reverse geocoding is best effort.
      }
    },
    [moveTo],
  );

  const onMapPress = useCallback(
    (event: MapPressEvent) => {
      setDestinationFromCoord(event.nativeEvent.coordinate, false);
    },
    [setDestinationFromCoord],
  );

  const onSearchSubmit = useCallback(async () => {
    const query = search.trim();
    if (!query) {
      return;
    }
    const typed = parseCoordinateInput(query);
    if (typed) {
      setLabel(formatCoordinate(typed));
      setDestination(typed);
      moveTo(typed);
      return;
    }
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(query);
      const first = results[0];
      if (!first || !isValidCoordinate(first)) {
        Alert.alert(
          "Not found",
          "Could not find that place. Try a different search or tap the map.",
        );
        return;
      }
      const coord: Coordinate = {
        latitude: first.latitude,
        longitude: first.longitude,
      };
      setLabel(query);
      setDestination(coord);
      moveTo(coord);
    } catch {
      Alert.alert(
        "Search unavailable",
        "Address search is rate limited. Tap the map to drop a pin instead.",
      );
    } finally {
      setGeocoding(false);
    }
  }, [search, moveTo]);

  const useCurrentLocation = useCallback(async () => {
    let snapshot = await getPermissionSnapshot();
    if (!snapshot.foregroundGranted) {
      await requestForegroundLocation();
      snapshot = await getPermissionSnapshot();
      setPermissions(snapshot);
    }
    if (!snapshot.foregroundGranted) {
      Alert.alert(
        "Location needed",
        "Allow location access to center the map.",
      );
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      moveTo({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch {
      Alert.alert("Unavailable", "Could not read your current location.");
    }
  }, [moveTo]);

  const chooseRadius = useCallback((meters: number) => {
    setRadiusMeters(meters);
    setCustomRadius("");
  }, []);

  const onCustomRadiusChange = useCallback((text: string) => {
    setCustomRadius(text);
    const parsed = Number(text);
    const result = validateRadius(parsed);
    if (result.ok) {
      setRadiusMeters(result.radiusMeters);
    }
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const requestAllPermissions = useCallback(async () => {
    const fg = await requestForegroundLocation();
    if (!fg) {
      Alert.alert(
        "Location required",
        "Enable location access in Settings to detect arrival.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: openSettings },
        ],
      );
      await refreshPermissions();
      return;
    }
    const bg = await requestBackgroundLocation();
    if (!bg) {
      Alert.alert(
        "Always allow needed",
        'Set location to "Allow all the time" so arrival works while the app is closed.',
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: openSettings },
        ],
      );
    }
    await requestNotifications();
    await refreshPermissions();
  }, [openSettings, refreshPermissions]);

  const onStart = useCallback(async () => {
    if (!destination) {
      Alert.alert(
        "Pick a destination",
        "Enter coordinates, search or tap the map to set where you're going.",
      );
      return;
    }
    const radius = validateRadius(radiusMeters);
    if (!radius.ok) {
      Alert.alert("Invalid radius", radius.error);
      return;
    }

    let snapshot = await getPermissionSnapshot();
    if (!canMonitor(snapshot)) {
      await requestAllPermissions();
      snapshot = await getPermissionSnapshot();
      if (!canMonitor(snapshot)) {
        return;
      }
    }

    const trip: Trip = {
      id: `trip-${Date.now()}`,
      label: label || formatCoordinate(destination),
      destination,
      radiusMeters: radius.radiusMeters,
      createdAt: Date.now(),
      arrivedAt: null,
    };

    setStarting(true);
    try {
      const health = await startTripMonitoring(trip);
      if (health === "monitoring") {
        router.replace("/trip");
      } else if (health === "location-services-off") {
        Alert.alert(
          "Turn on location",
          "Enable device location services to start.",
        );
      } else {
        Alert.alert(
          "Permissions needed",
          "Grant Always location and notifications to start monitoring.",
        );
      }
    } finally {
      setStarting(false);
    }
  }, [destination, label, radiusMeters, requestAllPermissions, router]);

  const ready = canMonitor(permissions);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>Where are you headed?</Text>
      <Text style={styles.sub}>
        Set a destination and radius. We&apos;ll alert you strongly when you get
        close so you know when to stop.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search address or place or type coordinates"
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          returnKeyType="search"
        />
        <Pressable
          style={styles.searchButton}
          onPress={onSearchSubmit}
          disabled={geocoding}
        >
          {geocoding ? (
            <ActivityIndicator color="#0B1221" />
          ) : (
            <Text style={styles.searchButtonText}>Go</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={onMapPress}
          showsUserLocation={permissions.foregroundGranted}
        >
          {destination && (
            <>
              <Marker
                coordinate={destination}
                draggable
                onDragEnd={(e) =>
                  setDestinationFromCoord(e.nativeEvent.coordinate, false)
                }
              />
              <Circle
                center={destination}
                radius={radiusMeters}
                strokeColor="rgba(255,59,48,0.9)"
                fillColor="rgba(255,59,48,0.15)"
              />
            </>
          )}
        </MapView>
        <Pressable style={styles.locateButton} onPress={useCurrentLocation}>
          <Text style={styles.locateButtonText}>Use my location</Text>
        </Pressable>
      </View>

      <Text style={styles.destinationLabel}>
        {destination
          ? label || formatCoordinate(destination)
          : "Tap the map or search to drop a pin"}
      </Text>

      <Text style={styles.section}>Alert radius</Text>
      <View style={styles.radiusRow}>
        {RADIUS_PRESETS_METERS.map((preset) => {
          const selected = !customRadius && radiusMeters === preset;
          return (
            <Pressable
              key={preset}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => chooseRadius(preset)}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {formatDistance(preset)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Custom radius (meters)"
        placeholderTextColor="#64748B"
        value={customRadius}
        onChangeText={onCustomRadiusChange}
        keyboardType="number-pad"
      />

      <PermissionStatus
        permissions={permissions}
        onFix={requestAllPermissions}
      />

      <Pressable
        style={[styles.primaryButton, starting && styles.buttonDisabled]}
        onPress={onStart}
        disabled={starting}
      >
        {starting ? (
          <ActivityIndicator color="#0B1221" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {ready ? "Start monitoring" : "Grant access & start"}
          </Text>
        )}
      </Pressable>

      <Text style={styles.disclaimer}>
        Arrival detection depends on your OS and can be delayed a few minutes.
        Keep the app installed and don&apos;t force-quit it during your trip.
        Radii under ~200 m may be unreliable.
      </Text>
    </ScrollView>
  );
}

function PermissionStatus({
  permissions,
  onFix,
}: {
  permissions: PermissionSnapshot;
  onFix: () => void;
}) {
  const rows: { label: string; ok: boolean }[] = [
    { label: "Location while using", ok: permissions.foregroundGranted },
    { label: "Always allow location", ok: permissions.backgroundGranted },
    { label: "Notifications", ok: permissions.notificationsGranted },
    { label: "Location services on", ok: permissions.locationServicesEnabled },
  ];
  const allOk = rows.every((r) => r.ok);

  return (
    <View style={styles.permCard}>
      <Text style={styles.section}>Permissions</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.permRow}>
          <Text style={styles.permDot}>{row.ok ? "\u2713" : "\u2717"}</Text>
          <Text style={[styles.permText, !row.ok && styles.permTextBad]}>
            {row.label}
          </Text>
        </View>
      ))}
      {!allOk && (
        <Pressable style={styles.secondaryButton} onPress={onFix}>
          <Text style={styles.secondaryButtonText}>Grant permissions</Text>
        </Pressable>
      )}
      {Platform.OS === "android" && (
        <Text style={styles.permHint}>
          Android asks for &quot;Allow all the time&quot; in system settings.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1221" },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  heading: { color: "#F8FAFC", fontSize: 24, fontWeight: "700" },
  sub: { color: "#94A3B8", fontSize: 14, lineHeight: 20 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: { color: "#0B1221", fontWeight: "700", fontSize: 16 },
  mapCard: {
    height: 300,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  map: { width: "100%", height: "100%" },
  locateButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(15,23,42,0.85)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  locateButtonText: { color: "#F8FAFC", fontWeight: "600" },
  destinationLabel: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  section: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
  },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: "#38BDF8" },
  chipText: { color: "#CBD5E1", fontWeight: "600" },
  chipTextSelected: { color: "#0B1221" },
  permCard: {
    backgroundColor: "#111C33",
    borderRadius: 16,
    padding: 16,
    gap: 6,
    marginTop: 8,
  },
  permRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  permDot: { color: "#38BDF8", width: 18, fontSize: 16, fontWeight: "700" },
  permText: { color: "#E2E8F0", fontSize: 15 },
  permTextBad: { color: "#FCA5A5" },
  permHint: { color: "#64748B", fontSize: 12, marginTop: 4 },
  primaryButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  primaryButtonText: { color: "#0B1221", fontSize: 17, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: { color: "#0B1221", fontWeight: "700" },
  disclaimer: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
});
