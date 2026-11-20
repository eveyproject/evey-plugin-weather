// Adapter for the Evey iframe bridge (window.evey).
// Falls back to immediate defaults when running standalone (local dev).

import type { HostBridge, HostInit } from "../../domain/ports/HostBridge";
import { parseLat, parseLon, parseUnits } from "../../domain/services/location";

// Server config values as the host sends them: each one a string or a number,
// depending on how the host coerced it from the schema type.
type RawConfig = Record<string, unknown>;

interface EveyGlobal {
  onInit(cb: (data: {
    context?: Record<string, unknown>;
    config?: RawConfig;
    locale?: string;
    theme?: string;
    suggestedHeight?: number;
  }) => void): void;
  resize(height: number): void;
  navigate(path: string): void;
  toast(level: "success" | "error" | "info", message: string): void;
  assets?: { read(path: string): Promise<string> };
  prefs?: {
    get(key: string): Promise<{ value?: string; found?: boolean } | string | null>;
    set(key: string, value: string): Promise<unknown>;
  };
  // Only offered to the admin.plugin.config slot.
  config?: {
    save(values: Record<string, string>): Promise<{ values?: Record<string, string> }>;
  };
}

declare global {
  interface Window {
    evey?: EveyGlobal;
  }
}

const DEFAULT_CITY = "Paris";

// Host init message -> HostInit. Config values may be strings or numbers.
export function normalize(config?: RawConfig, locale?: string, theme?: string, suggestedHeight?: number): HostInit {
  const rawCity = config?.city;
  const city = typeof rawCity === "string" || typeof rawCity === "number" ? String(rawCity).trim() : "";
  return {
    city: city || DEFAULT_CITY,
    lat: parseLat(config?.lat),
    lon: parseLon(config?.lon),
    units: parseUnits(config?.units) ?? "celsius",
    locale: locale ?? "en",
    theme: theme ?? "dark",
    suggestedHeight,
  };
}

export class EveyBridge implements HostBridge {
  onReady(cb: (init: HostInit) => void): void {
    if (typeof window !== "undefined" && window.evey) {
      window.evey.onInit((data) => cb(normalize(data?.config, data?.locale, data?.theme, data?.suggestedHeight)));
    } else {
      // Standalone dev: no host bridge.
      cb(normalize(undefined, navigator?.language, undefined));
    }
  }

  resize(heightPx: number): void {
    window.evey?.resize(Math.round(heightPx));
  }

  async readAsset(path: string): Promise<string | null> {
    const api = window.evey?.assets;
    if (!api?.read) return null;
    try {
      const dataUrl = await api.read(path);
      return typeof dataUrl === "string" && dataUrl.startsWith("data:") ? dataUrl : null;
    } catch {
      return null;
    }
  }

  async getPref(key: string): Promise<string | null> {
    const api = window.evey?.prefs;
    if (!api?.get) return null;
    try {
      const r = await api.get(key);
      if (r == null) return null;
      if (typeof r === "string") return r;
      // GetPref RPC shape: { value, found }.
      if (r.found === false) return null;
      return typeof r.value === "string" ? r.value : null;
    } catch {
      return null;
    }
  }

  async setPref(key: string, value: string): Promise<void> {
    const api = window.evey?.prefs;
    if (!api?.set) return;
    try {
      await api.set(key, value);
    } catch {
      /* best-effort */
    }
  }

  async saveConfig(values: Record<string, string>): Promise<Record<string, string>> {
    const api = typeof window !== "undefined" ? window.evey?.config : undefined;
    if (!api?.save) throw new Error("config.save is not available");
    const r = await api.save(values);
    return r?.values ?? {};
  }

  toast(level: "success" | "error" | "info", message: string): void {
    window.evey?.toast?.(level, message);
  }
}
