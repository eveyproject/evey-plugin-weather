// Composition root for the admin.plugin.config module: the same city picker
// as the profile panel, writing the server's default city to the plugin config.
import { SettingsApp, SERVER_COPY } from "../settings/SettingsApp";
import { ServerResidenceStore } from "../settings/ResidenceStore";
import { EveyBridge } from "../adapters/evey/EveyBridge";
import { OpenMeteoProvider } from "../adapters/openmeteo/OpenMeteoProvider";

const bridge = new EveyBridge();
new SettingsApp(bridge, new OpenMeteoProvider(), new ServerResidenceStore(bridge), SERVER_COPY).start();
