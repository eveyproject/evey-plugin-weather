// City + temperature unit panel. The same panel runs in two slots, and only
// its store and its title/description differ:
//   - settings.user.appearance: a profile's own place, in per-profile prefs;
//   - admin.plugin.config: the server's default place, in the plugin config,
//     used by every profile that has not chosen its own.
// See ResidenceStore. Zero runtime deps: vanilla DOM.
//
// The city input is DISAMBIGUATED: as the user types we geocode and show the
// matching places with their region + country ("Brest, Bretagne, France" vs
// "Brest, Brest Region, Belarus"). The user picks one and we store its
// COORDINATES - the widget never re-geocodes a bare name and lands on the wrong
// homonym (Open-Meteo ranks by population, so a bare "Brest" resolved to Belarus).

import type { HostBridge, HostInit } from "../domain/ports/HostBridge";
import type { WeatherProvider } from "../domain/ports/WeatherProvider";
import type { GeoCandidate, Units } from "../domain/model/weather";
import { preselect, type Residence } from "../domain/services/location";
import { translate } from "../i18n/labels";
import type { ResidenceStore } from "./ResidenceStore";

// i18n keys of the panel heading, the only text that differs between slots.
export interface PanelCopy {
  title: string;
  desc: string;
}

export const PROFILE_COPY: PanelCopy = { title: "set_title", desc: "set_desc" };
export const SERVER_COPY: PanelCopy = { title: "adm_title", desc: "adm_desc" };

const SEARCH_DEBOUNCE_MS = 400;

export class SettingsApp {
  private locale = "en";
  private saving = false;
  private booted = false;

  private candidates: GeoCandidate[] = [];
  private searchTimer = 0;
  private searchSeq = 0;

  private cityEl: HTMLInputElement | null = null;
  private pickBlock: HTMLDivElement | null = null;
  private resultsEl: HTMLSelectElement | null = null;
  private statusEl: HTMLParagraphElement | null = null;
  private unitsEl: HTMLSelectElement | null = null;

  constructor(
    private bridge: HostBridge,
    private provider: WeatherProvider,
    private store: ResidenceStore,
    private copy: PanelCopy = PROFILE_COPY,
  ) {}

  start(): void {
    this.bridge.onReady((init) => void this.boot(init));
  }

  private t(key: string): string {
    return translate(key, this.locale);
  }

  private async boot(init: HostInit): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    this.locale = init.locale;
    document.documentElement.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.background = "transparent";

    const current = await this.store.load(init);
    this.render(init.theme !== "light", current.city, current.units);
    // Pre-populate the picker with the saved city so the current choice shows,
    // still selected when it was picked by its coordinates.
    if (current.city.trim()) void this.runSearch(current.city.trim(), current);
  }

  private render(dark: boolean, city: string, units: Units): void {
    const text = dark ? "#e9eaed" : "#1b1c1f";
    const muted = dark ? "#9aa0a6" : "#5f6368";
    const field = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    const border = dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)";
    const accent = "#e8a33d";

    const style = document.createElement("style");
    style.textContent = `
      .wxs { font-family: system-ui, -apple-system, sans-serif; color: ${text}; display: flex; flex-direction: column; gap: 12px; }
      .wxs h3 { margin: 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .wxs p { margin: 0; font-size: 12px; color: ${muted}; }
      .wxs label { font-size: 12px; font-weight: 500; color: ${muted}; display: block; margin-bottom: 4px; }
      .wxs input, .wxs select {
        width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 14px;
        color: ${text}; background: ${field}; border: 1px solid ${border};
        border-radius: 8px; outline: none;
      }
      .wxs input:focus, .wxs select:focus { border-color: ${accent}; }
      .wxs option { color: #1b1c1f; }
      .wxs .row { max-width: 420px; }
      .wxs .hint { margin-top: 4px; font-size: 11px; color: ${muted}; }
      .wxs button {
        align-self: flex-start; padding: 8px 16px; font-size: 14px; font-weight: 600;
        color: #1b1c1f; background: ${accent}; border: none; border-radius: 8px; cursor: pointer;
      }
      .wxs button:disabled { opacity: 0.6; cursor: default; }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.className = "wxs";
    root.innerHTML = `
      <h3><span aria-hidden="true">🌤️</span>${esc(this.t(this.copy.title))}</h3>
      <p>${esc(this.t(this.copy.desc))}</p>
      <div class="row">
        <label for="wxs-city">${esc(this.t("set_city"))}</label>
        <input id="wxs-city" type="text" autocomplete="off" placeholder="${esc(this.t("set_city_ph"))}">
      </div>
      <div class="row" id="wxs-pick" style="display:none">
        <label for="wxs-results">${esc(this.t("set_pick"))}</label>
        <select id="wxs-results"></select>
        <p class="hint">${esc(this.t("set_pick_hint"))}</p>
      </div>
      <p class="hint" id="wxs-status" style="display:none"></p>
      <div class="row">
        <label for="wxs-units">${esc(this.t("set_units"))}</label>
        <select id="wxs-units">
          <option value="celsius">${esc(this.t("set_celsius"))}</option>
          <option value="fahrenheit">${esc(this.t("set_fahrenheit"))}</option>
        </select>
      </div>
      <button id="wxs-save" type="button">${esc(this.t("set_save"))}</button>
    `;
    document.body.appendChild(root);

    this.cityEl = root.querySelector<HTMLInputElement>("#wxs-city")!;
    this.pickBlock = root.querySelector<HTMLDivElement>("#wxs-pick")!;
    this.resultsEl = root.querySelector<HTMLSelectElement>("#wxs-results")!;
    this.statusEl = root.querySelector<HTMLParagraphElement>("#wxs-status")!;
    this.unitsEl = root.querySelector<HTMLSelectElement>("#wxs-units")!;
    const saveEl = root.querySelector<HTMLButtonElement>("#wxs-save")!;

    this.cityEl.value = city;
    this.unitsEl.value = units;
    this.cityEl.addEventListener("input", () => this.onCityInput());
    this.resultsEl.addEventListener("change", () => this.fitHeight());
    saveEl.addEventListener("click", () => void this.save(saveEl));

    this.fitHeight();
  }

  private onCityInput(): void {
    const value = this.cityEl?.value.trim() ?? "";
    clearTimeout(this.searchTimer);
    if (!value) {
      this.setCandidates([]);
      return;
    }
    this.searchTimer = window.setTimeout(() => void this.runSearch(value), SEARCH_DEBOUNCE_MS);
  }

  private async runSearch(value: string, current?: Residence): Promise<void> {
    const seq = ++this.searchSeq;
    this.setStatus(this.t("set_searching"));
    let results: GeoCandidate[] = [];
    try {
      results = await this.provider.geocodeSearch(value, this.locale);
    } catch {
      results = [];
    }
    if (seq !== this.searchSeq) return; // a newer search superseded this one
    if (current) {
      const { list, index } = preselect(results, current);
      this.setCandidates(list, index);
    } else {
      this.setCandidates(results);
    }
  }

  private setCandidates(list: GeoCandidate[], selected = 0): void {
    this.candidates = list;
    const results = this.resultsEl;
    const pick = this.pickBlock;
    if (!results || !pick) return;
    results.innerHTML = "";
    if (list.length === 0) {
      pick.style.display = "none";
      const typed = this.cityEl?.value.trim() ?? "";
      this.setStatus(typed ? this.t("set_no_match") : null);
      this.fitHeight();
      return;
    }
    this.setStatus(null);
    for (let i = 0; i < list.length; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = candidateLabel(list[i]);
      results.appendChild(opt);
    }
    results.value = String(selected);
    pick.style.display = "";
    this.fitHeight();
  }

  private setStatus(msg: string | null): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg ?? "";
    this.statusEl.style.display = msg ? "" : "none";
  }

  private async save(btn: HTMLButtonElement): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    btn.disabled = true;
    try {
      const units: Units = this.unitsEl?.value === "fahrenheit" ? "fahrenheit" : "celsius";
      const idx = this.resultsEl ? parseInt(this.resultsEl.value, 10) : NaN;
      const picked = Number.isInteger(idx) ? this.candidates[idx] : undefined;
      // A picked candidate stores its exact coordinates so the widget never
      // re-geocodes the name. Without one (search failed or empty), the bare
      // name goes with no coordinates and the widget geocodes it.
      const place: Residence = picked
        ? { city: picked.name, units, lat: picked.lat, lon: picked.lon }
        : { city: this.cityEl?.value.trim() ?? "", units, lat: null, lon: null };
      await this.store.save(place);
      this.bridge.toast("success", this.t("set_saved"));
    } catch (err) {
      this.bridge.toast("error", errorText(this.t("set_error"), err));
    } finally {
      this.saving = false;
      btn.disabled = false;
    }
  }

  private fitHeight(): void {
    const h = Math.max(120, Math.ceil(document.body.scrollHeight) + 8);
    this.bridge.resize(h);
  }
}

// "Brest, Bretagne, France" - name plus whatever region/country we have.
function candidateLabel(c: GeoCandidate): string {
  return [c.name, c.admin1, c.country].filter((v) => v && v.trim()).join(", ");
}

// "Couldn't save: <host message>" when the host said why.
export function errorText(base: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return msg.trim() ? `${base}: ${msg.trim()}` : base;
}

// Minimal HTML-escape for the small set of interpolated i18n strings.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
