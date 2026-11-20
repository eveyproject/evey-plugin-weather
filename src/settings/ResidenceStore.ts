// Where the city picker reads and writes its place. The same panel serves two
// slots: a profile's own city (settings.user.appearance, per-profile prefs)
// and the server's default city (admin.plugin.config, the plugin config).

import type { HostBridge, HostInit } from "../domain/ports/HostBridge";
import { parseUnits, resolveLocation, type Residence } from "../domain/services/location";

export const CITY_KEY = "residence.city";
export const UNITS_KEY = "residence.units";
export const LAT_KEY = "residence.lat";
export const LON_KEY = "residence.lon";

export interface ResidenceStore {
  load(init: HostInit): Promise<Residence>;
  // Rejects when the place was not stored, with the host's message if any.
  save(place: Residence): Promise<void>;
}

const coordText = (v: number | null): string => (v === null ? "" : String(v));

// A profile's own place, in the plugin's per-profile prefs. Without a pick of
// its own the profile sees the server default, coordinates included.
export class ProfileResidenceStore implements ResidenceStore {
  constructor(private bridge: HostBridge) {}

  async load(init: HostInit): Promise<Residence> {
    const [city, units, lat, lon] = await Promise.all([
      this.bridge.getPref(CITY_KEY),
      this.bridge.getPref(UNITS_KEY),
      this.bridge.getPref(LAT_KEY),
      this.bridge.getPref(LON_KEY),
    ]);
    const where = resolveLocation({ city, lat, lon }, init);
    return {
      city: where.city,
      units: parseUnits(units) ?? init.units,
      lat: where.coord?.lat ?? null,
      lon: where.coord?.lon ?? null,
    };
  }

  async save(place: Residence): Promise<void> {
    // Empty coordinates clear a stale pick, so a bare name is geocoded.
    await Promise.all([
      this.bridge.setPref(UNITS_KEY, place.units),
      this.bridge.setPref(CITY_KEY, place.city),
      this.bridge.setPref(LAT_KEY, coordText(place.lat)),
      this.bridge.setPref(LON_KEY, coordText(place.lon)),
    ]);
  }
}

// The server's default place, in the plugin config (config_schema city, lat,
// lon, units). The host merges these keys into the stored config and checks
// them against the schema.
export class ServerResidenceStore implements ResidenceStore {
  constructor(private bridge: HostBridge) {}

  async load(init: HostInit): Promise<Residence> {
    return { city: init.city, units: init.units, lat: init.lat, lon: init.lon };
  }

  async save(place: Residence): Promise<void> {
    await this.bridge.saveConfig({
      city: place.city,
      lat: coordText(place.lat),
      lon: coordText(place.lon),
      units: place.units,
    });
  }
}
