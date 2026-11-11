# Weather

An [Evey](https://github.com/eveyproject/evey) plugin: the weather where you live, on the home screen, behind a sky that matches it - sun, clouds, rain, snow, and the moon in its real phase tonight. Each person picks their city and units in **Settings > Appearance**.

## What it asks for

- `network`, limited to `api.open-meteo.com`, `geocoding-api.open-meteo.com` (forecast and city search) and `sdo.gsfc.nasa.gov` (the day's image of the sun).
- `prefs`: each profile's city and units.
- Slots: `home.section` (the widget) and `settings.user.appearance` (the city picker).

## Architecture (DDD, dependencies point inward)

```
src/
  domain/            pure TS, zero deps, fully unit-tested
    model/           weather.ts (snapshot, sun times), scene.ts (params, palette)
    services/        conditionToScene (WMO table), dayCycle (real solar events),
                     paletteMixer (time-of-day x mood), moonPhase
    ports/           WeatherProvider, HostBridge, SceneRenderer
  application/       WeatherApp: orchestration, refresh (15 min) + day-cycle
                     tick (5 s, live sun/moon motion without any page reload),
                     bounded retries, lifecycle/dispose
  adapters/          openmeteo/ (HTTP, 10 s timeout), evey/ (window.evey bridge,
                     standalone fallback), render/ (raw WebGL renderer + shader)
  ui/                vanilla-DOM overlay (no React)
  i18n/              labels en/fr/es/de
```

## Assets

Both celestial bodies are real NASA photos (public domain), bundled as small
JPEGs (disc masked in-shader, no alpha needed):
- moon: NASA/GSFC FullMoon2010 (via Wikimedia Commons), 320px, 17 KB
- sun: 2 real NASA/SDO full-disc images (credit: NASA/SDO and the AIA science
  team), one per daily rotation skin, cropped tight so the disc fills the
  frame (like the moon), 384px each: AIA 171 (gold) and AIA 193 (bronze). A
  different one shows each UTC day (see `domain/services/sunModel.ts`); the
  shader keeps each skin's own tones by day and warms everything toward orange
  at the horizon. Disc radius is set by `SR` in the shader (~2x the moon).

  These images are snapshots bundled at build time (offline-safe, no network,
  no CORS). Fetching the *live* "latest" SDO image per day is not possible from
  the sandboxed iframe: NASA serves no CORS header (WebGL texture upload would
  taint), and the plugin CSP restricts `img-src` to the host origin. Live
  fetch would require a host-side proxy endpoint in Evey core - see the note
  at the bottom.

## Rendering

Single-pass fragment shader compositing (straight alpha over transparent
canvas, host page shows through): golden-hour wash -> moon (photo texture,
phase terminator) -> 2 FBM cloud layers (rim-lit toward the light source)
-> thunder flash -> fog -> GPU rain/snow -> sun (disk + corona + rays,
occluded per pixel by the clouds above it). ~30 fps cap, pauses when hidden
or scrolled out of view, honors prefers-reduced-motion, survives WebGL
context loss.

## Install

Each [release](../../releases) publishes `weather-<version>.zip`, its cosign
signature (`.zip.sig`) and its sha256. In Evey, open **Admin > Plugins >
Install Plugin > From URL** and paste the URL given in the release notes; the
`#sha256:` it ends with makes Evey check the download, and Evey fetches the
signature next to it on its own. The preview shows **Signed by** the Evey
project key once you trust it.

The Evey project key has the fingerprint `sha256:c29eb603b19d99a50f3fa6c94b7e92c41710779261e73e0fa31d53a78902e09a`. Compare it with the one
the preview shows before you trust it.

## Build

```sh
./scripts/build-zip.sh      # -> out/weather-<version>.zip
```

The same commit always gives the same zip, so a rebuild can be compared with
a published release byte for byte.

## Release

Bump `version` in `plugin.yaml`, then push a tag `v<version>`. The release
workflow builds, signs with the project key and publishes.

## License

MIT, see [LICENSE](LICENSE).

## Version history

- **1.0.0** - first release out of the Evey repository, under the name `weather` and signed with the Evey project key. It carries everything below.

Before 1.0.0 the plugin lived in the Evey repository as `weather-v2`:

- **2.19.0** - the package can be signed: the build ships the publisher's public key as `cosign.pub` at the ZIP root and a `.zip.sig` goes next to the ZIP, so Evey pins the publisher at install and flags a later update signed by anyone else.
- **2.15.0** - on a television the widget asks for a banner instead of a card, because a TV row is as wide as a desktop page while the panel has a fraction of the vertical room and the card height hid the library below the fold.
- **2.14.0** - live SDO frames are re-cropped to the bundled skin's tight geometry (limb at 0.93) so the shader's disc mask lines up and the edge stops looking nibbled.
- **2.13.0** - dark SDO frames are now rejected server-side (jpeg-js decode) before being persisted; the frontend pixel gate is blinded by Firefox resistFingerprinting.
- **2.12.0** - dark SDO frames (eclipse/calibration) are rejected on decoded brightness, so the sun never renders black.
- **2.11.0** - the sun-image fetch now goes through the host Fetch broker (no direct plugin network access).
- **2.10.0** - disambiguated city picker (region + country, stores coordinates) so homonyms like Brest FR/BY resolve correctly.
