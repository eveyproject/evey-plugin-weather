// Driven port: the plugin host (Evey iframe bridge).

import type { Units } from "../model/weather";

export interface HostInit {
  // Server default city (plugin config), with its coordinates when the admin
  // picked it from the list (null for a bare name, geocoded by the widget).
  city: string;
  lat: number | null;
  lon: number | null;
  units: Units;
  locale: string;
  theme: string; // host theme mode ("dark" / "light"); drives settings-panel colors
  // The height the host recommends for this slot on the surface it put us on
  // (CSS px). Absent on a host too old to say.
  suggestedHeight?: number;
}

export interface HostBridge {
  onReady(cb: (init: HostInit) => void): void;
  resize(heightPx: number): void;
  // Reads one of the plugin's own web_root assets as a data: URL (e.g. a sun
  // image the backend downloaded at runtime). Resolves null when unavailable
  // (no host bridge, asset missing, or any error) so callers fall back.
  readAsset(path: string): Promise<string | null>;
  // Per-profile plugin preference store (scoped host-side to the active
  // profile). getPref resolves null when unset/unavailable so callers fall back
  // to the admin config default.
  getPref(key: string): Promise<string | null>;
  setPref(key: string, value: string): Promise<void>;
  // Merges these keys into the plugin's server config (admin.plugin.config
  // slot only). Resolves with the stored values; rejects with the host's
  // message when the host refuses them or has no such call.
  saveConfig(values: Record<string, string>): Promise<Record<string, string>>;
  // Best-effort user feedback toast; no-op standalone.
  toast(level: "success" | "error" | "info", message: string): void;
}
