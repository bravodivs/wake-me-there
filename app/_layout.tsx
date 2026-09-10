import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { STOP_ACTION_ID } from "../src/constants";
import { setupNotifications } from "../src/services/notificationService";
import { stopTripMonitoring } from "../src/services/geofenceService";
// Side effect: register the geofencing task before anything starts it.
import "../src/background/arrivalTask";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    setupNotifications();

    const handleStop = async () => {
      await stopTripMonitoring();
      if (mounted) {
        router.replace("/");
      }
    };

    // Handle taps received while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (response.actionIdentifier === STOP_ACTION_ID) {
          handleStop();
        }
      },
    );

    // Handle a tap that launched/opened the app while it was closed.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.actionIdentifier === STOP_ACTION_ID) {
        handleStop();
      }
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0B1221" },
            headerTintColor: "#F8FAFC",
            contentStyle: { backgroundColor: "#0B1221" },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ title: "Wake Me There" }}
          />
          <Stack.Screen name="trip" options={{ title: "Active trip" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
