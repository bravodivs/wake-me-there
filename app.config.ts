import { ExpoConfig, ConfigContext } from "expo/config";

// Read the Android Google Maps key from the environment so it never gets
// committed. iOS uses Apple Maps by default and needs no key.
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Wake Me There",
  slug: "wake-me-there",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "wakemethere",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.wakemethere.app",
    infoPlist: {
      // Region monitoring keeps working while backgrounded/locked.
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    package: "com.wakemethere.app",
    adaptiveIcon: {
      backgroundColor: "#0B1221",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "POST_NOTIFICATIONS",
      "VIBRATE",
      "RECEIVE_BOOT_COMPLETED",
    ],
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Wake Me There uses your location to show how close you are to your destination.",
        locationAlwaysAndWhenInUsePermission:
          "Wake Me There needs background location to alert you when you arrive, even while the app is closed or your screen is locked.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        // OS geofencing does not poll continuously, so no foreground service.
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      "expo-notifications",
      {
        color: "#FF3B30",
        sounds: ["./assets/arrival_alert.wav"],
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: "f1a8f7f0-e958-4543-b8aa-36ecfb2bd89c",
    },
  },
});
