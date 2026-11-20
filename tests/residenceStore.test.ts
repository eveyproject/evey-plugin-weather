import { describe, it, expect, afterEach } from "vitest";
import type { HostBridge, HostInit } from "../src/domain/ports/HostBridge";
import { ProfileResidenceStore, ServerResidenceStore } from "../src/settings/ResidenceStore";
import { EveyBridge, normalize } from "../src/adapters/evey/EveyBridge";
import { errorText } from "../src/settings/SettingsApp";

function fakeBridge(prefs: Record<string, string> = {}, save?: (v: Record<string, string>) => Promise<Record<string, string>>) {
  const saved: Array<Record<string, string>> = [];
  const bridge: HostBridge = {
    onReady: () => {},
    resize: () => {},
    readAsset: async () => null,
    getPref: async (k) => (k in prefs ? prefs[k] : null),
    setPref: async (k, v) => {
      prefs[k] = v;
    },
    saveConfig: async (v) => {
      saved.push(v);
      return save ? save(v) : v;
    },
    toast: () => {},
  };
  return { bridge, prefs, saved };
}

const init = (over: Partial<HostInit> = {}): HostInit => ({
  city: "Brest",
  lat: 48.39,
  lon: -4.49,
  units: "celsius",
  locale: "fr",
  theme: "dark",
  ...over,
});

describe("ServerResidenceStore", () => {
  it("loads the server config from init", async () => {
    const { bridge } = fakeBridge();
    const store = new ServerResidenceStore(bridge);
    expect(await store.load(init({ units: "fahrenheit" }))).toEqual({
      city: "Brest",
      units: "fahrenheit",
      lat: 48.39,
      lon: -4.49,
    });
  });

  it("saves city, lat, lon and units as strings through config.save", async () => {
    const { bridge, saved } = fakeBridge();
    await new ServerResidenceStore(bridge).save({ city: "Brest", units: "celsius", lat: 48.39, lon: -4.49 });
    expect(saved).toEqual([{ city: "Brest", lat: "48.39", lon: "-4.49", units: "celsius" }]);
  });

  it("clears the coordinates for a bare name", async () => {
    const { bridge, saved } = fakeBridge();
    await new ServerResidenceStore(bridge).save({ city: "Paris", units: "fahrenheit", lat: null, lon: null });
    expect(saved).toEqual([{ city: "Paris", lat: "", lon: "", units: "fahrenheit" }]);
  });

  it("propagates a refusal from the host", async () => {
    const { bridge } = fakeBridge({}, async () => {
      throw new Error("city is required");
    });
    await expect(
      new ServerResidenceStore(bridge).save({ city: "", units: "celsius", lat: null, lon: null }),
    ).rejects.toThrow("city is required");
  });
});

describe("ProfileResidenceStore", () => {
  it("a profile without a pick sees the server city and its coordinates", async () => {
    const { bridge } = fakeBridge();
    expect(await new ProfileResidenceStore(bridge).load(init())).toEqual({
      city: "Brest",
      units: "celsius",
      lat: 48.39,
      lon: -4.49,
    });
  });

  it("a profile pick wins over the server default", async () => {
    const { bridge } = fakeBridge({
      "residence.city": "Lyon",
      "residence.lat": "45.75",
      "residence.lon": "4.85",
      "residence.units": "fahrenheit",
    });
    expect(await new ProfileResidenceStore(bridge).load(init())).toEqual({
      city: "Lyon",
      units: "fahrenheit",
      lat: 45.75,
      lon: 4.85,
    });
  });

  it("saves to the profile prefs, never to the server config", async () => {
    const { bridge, prefs, saved } = fakeBridge();
    await new ProfileResidenceStore(bridge).save({ city: "Lyon", units: "celsius", lat: 45.75, lon: 4.85 });
    expect(prefs).toEqual({
      "residence.city": "Lyon",
      "residence.lat": "45.75",
      "residence.lon": "4.85",
      "residence.units": "celsius",
    });
    expect(saved).toEqual([]);
  });
});

describe("EveyBridge.normalize", () => {
  it("reads lat/lon sent as numbers or as strings", () => {
    expect(normalize({ city: "Brest", lat: 48.39, lon: -4.49 })).toMatchObject({ city: "Brest", lat: 48.39, lon: -4.49 });
    expect(normalize({ city: "Brest", lat: "48.39", lon: "-4.49" })).toMatchObject({ lat: 48.39, lon: -4.49 });
  });

  it("gives null coordinates when they are empty or missing, and the default city", () => {
    expect(normalize({ city: "Lyon", lat: "", lon: "" })).toMatchObject({ city: "Lyon", lat: null, lon: null });
    expect(normalize(undefined)).toMatchObject({ city: "Paris", lat: null, lon: null, units: "celsius", locale: "en" });
    expect(normalize({ city: "  " })).toMatchObject({ city: "Paris" });
  });

  it("keeps known units only", () => {
    expect(normalize({ units: "fahrenheit" }).units).toBe("fahrenheit");
    expect(normalize({ units: "kelvin" }).units).toBe("celsius");
  });
});

describe("EveyBridge.saveConfig", () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("calls evey.config.save and returns the stored values", async () => {
    const calls: unknown[] = [];
    g.window = {
      evey: {
        config: {
          save: async (v: Record<string, string>) => {
            calls.push(v);
            return { values: { ...v, other: "kept" } };
          },
        },
      },
    };
    const out = await new EveyBridge().saveConfig({ city: "Brest", lat: "48.39", lon: "-4.49", units: "celsius" });
    expect(calls).toEqual([{ city: "Brest", lat: "48.39", lon: "-4.49", units: "celsius" }]);
    expect(out.other).toBe("kept");
  });

  it("propagates the host's rejection", async () => {
    g.window = { evey: { config: { save: async () => Promise.reject(new Error("method not permitted: config.save")) } } };
    await expect(new EveyBridge().saveConfig({ city: "x" })).rejects.toThrow("method not permitted: config.save");
  });

  it("rejects when the host offers no config.save", async () => {
    g.window = { evey: {} };
    await expect(new EveyBridge().saveConfig({ city: "x" })).rejects.toThrow();
  });
});

describe("errorText", () => {
  it("appends the host message when there is one", () => {
    expect(errorText("Couldn't save", new Error("lat must be a number"))).toBe("Couldn't save: lat must be a number");
    expect(errorText("Couldn't save", "city is required")).toBe("Couldn't save: city is required");
    expect(errorText("Couldn't save", new Error(""))).toBe("Couldn't save");
    expect(errorText("Couldn't save", undefined)).toBe("Couldn't save");
  });
});
