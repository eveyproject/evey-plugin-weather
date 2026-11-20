import { describe, it, expect } from "vitest";
import { parseLat, parseLon, parseUnits, preselect, resolveLocation } from "../src/domain/services/location";

const brestFR = { name: "Brest", lat: 48.39, lon: -4.49, admin1: "Bretagne", country: "France" };
const brestBY = { name: "Brest", lat: 52.1, lon: 23.7, admin1: "Brest Region", country: "Belarus" };

describe("parseLat / parseLon", () => {
  it("accepts a number or a numeric string", () => {
    expect(parseLat(48.39)).toBe(48.39);
    expect(parseLat("48.39")).toBe(48.39);
    expect(parseLon(" -4.49 ")).toBe(-4.49);
    expect(parseLon(0)).toBe(0);
    expect(parseLon("0")).toBe(0);
  });

  it("gives null for empty, missing, non-numeric or out-of-range values", () => {
    for (const v of ["", "   ", null, undefined, "abc", NaN, Infinity, true, {}]) {
      expect(parseLat(v), String(v)).toBeNull();
    }
    expect(parseLat(90.5)).toBeNull();
    expect(parseLat("-91")).toBeNull();
    expect(parseLon(180)).toBe(180);
    expect(parseLon("180.1")).toBeNull();
  });
});

describe("parseUnits", () => {
  it("keeps known units only", () => {
    expect(parseUnits("fahrenheit")).toBe("fahrenheit");
    expect(parseUnits("celsius")).toBe("celsius");
    expect(parseUnits("kelvin")).toBeNull();
    expect(parseUnits(null)).toBeNull();
  });
});

describe("resolveLocation", () => {
  const server = { city: "Brest", lat: 48.39, lon: -4.49 };

  it("a profile pick with coordinates wins", () => {
    const r = resolveLocation({ city: "Lyon", lat: "45.75", lon: "4.85" }, server);
    expect(r).toEqual({ city: "Lyon", coord: { name: "Lyon", lat: 45.75, lon: 4.85 } });
  });

  it("a profile bare name is geocoded, even when the server has coordinates", () => {
    const r = resolveLocation({ city: "Lyon", lat: "", lon: "" }, server);
    expect(r).toEqual({ city: "Lyon", coord: null });
  });

  it("without a profile pick, the server city is used with its coordinates", () => {
    for (const pref of [
      { city: null, lat: null, lon: null },
      { city: "  ", lat: "", lon: "" },
    ]) {
      const r = resolveLocation(pref, server);
      expect(r).toEqual({ city: "Brest", coord: { name: "Brest", lat: 48.39, lon: -4.49 } });
    }
  });

  it("without a profile pick and without server coordinates, the server name is geocoded", () => {
    const r = resolveLocation({ city: null, lat: null, lon: null }, { city: "Paris", lat: null, lon: null });
    expect(r).toEqual({ city: "Paris", coord: null });
  });

  it("half a pair of coordinates is no coordinates", () => {
    expect(resolveLocation({ city: "Lyon", lat: "45.75", lon: "" }, server).coord).toBeNull();
    expect(resolveLocation({ city: null, lat: null, lon: null }, { city: "Brest", lat: 48.39, lon: null }).coord).toBeNull();
  });
});

describe("preselect", () => {
  it("selects the candidate at the stored coordinates", () => {
    const r = preselect([brestBY, brestFR], { city: "Brest", units: "celsius", lat: 48.4, lon: -4.5 });
    expect(r.index).toBe(1);
    expect(r.list).toHaveLength(2);
  });

  it("puts the stored place first when the search did not return it", () => {
    const r = preselect([brestBY], { city: "Brest", units: "celsius", lat: 48.39, lon: -4.49 });
    expect(r.index).toBe(0);
    expect(r.list[0]).toEqual({ name: "Brest", lat: 48.39, lon: -4.49 });
    expect(r.list[1]).toBe(brestBY);
  });

  it("keeps the first candidate for a bare name", () => {
    const r = preselect([brestBY, brestFR], { city: "Brest", units: "celsius", lat: null, lon: null });
    expect(r).toEqual({ list: [brestBY, brestFR], index: 0 });
  });
});
