// Composition root for the settings.user.appearance module (a separate iframe
// from the home widget, sharing the same plugin per-profile pref namespace).
import { SettingsApp, PROFILE_COPY } from "./SettingsApp";
import { ProfileResidenceStore } from "./ResidenceStore";
import { EveyBridge } from "../adapters/evey/EveyBridge";
import { OpenMeteoProvider } from "../adapters/openmeteo/OpenMeteoProvider";

const bridge = new EveyBridge();
new SettingsApp(bridge, new OpenMeteoProvider(), new ProfileResidenceStore(bridge), PROFILE_COPY).start();
