/**
 * PLAYER PREFERENCES — one tiny persisted settings store shared by every
 * surface (settings modal, HUDs, sfx). Pure logic + guarded localStorage so it
 * also runs under vitest/node. Defaults: °F, 70% volume, motion on.
 *
 * Temperature policy (see the units milestone): the SIM stores °C everywhere;
 * every DISPLAY goes through fmtTemp()/fmtTempRange() so the whole game flips
 * with one setting.
 */

export type TempUnit = "F" | "C";
export type TimeFormat = "12h" | "24h";
export type QualityPreset = "performance" | "balanced" | "high";

export interface Prefs {
  tempUnit: TempUnit;
  /** 0..1 master volume. */
  volume: number;
  reducedMotion: boolean;
  // ── Settings-screen prefs (v2) ── every field heals to its default.
  /** 0..1 effects channel (multiplies master). */
  sfxVolume: number;
  /** Persisted for the future music/ambience systems (no players yet). */
  musicVolume: number;
  ambientVolume: number;
  uiVolume: number;
  muted: boolean;
  timeFormat: TimeFormat;
  /** Menu-layer zoom (hub + screens), 0.9..1.2. */
  uiScale: number;
  /** Extra accessibility zoom multiplied into uiScale, 0.95..1.15. */
  textScale: number;
  /** 3D render resolution as a fraction of device resolution, 0.5..1. */
  renderScale: number;
  quality: QualityPreset;
  /** 0 = uncapped (browser refresh), else a real frame cap. */
  maxFps: number;
  /** Saved for the dynamic-lighting / post-processing updates. */
  shadowsOn: boolean;
  bloomOn: boolean;
  /** OrbitControls speed multiplier, 0.4..2. */
  cameraSensitivity: number;
  invertDrag: boolean;
  /** Seconds between autosaves, 4..60. */
  autosaveSec: number;
  /** Beginner tip toasts (mode hints). */
  hints: boolean;
  /** Care reminders on the hub / Habitats page. */
  reminders: boolean;
  highContrast: boolean;
}

const KEY = "glasswater.prefs.v1";

export const DEFAULT_PREFS: Prefs = {
  tempUnit: "F",
  volume: 0.7,
  reducedMotion: false,
  sfxVolume: 1,
  musicVolume: 0.6,
  ambientVolume: 0.6,
  uiVolume: 1,
  muted: false,
  timeFormat: "12h",
  uiScale: 1,
  textScale: 1,
  renderScale: 1,
  quality: "high",
  maxFps: 0,
  shadowsOn: true,
  bloomOn: true,
  cameraSensitivity: 1,
  invertDrag: false,
  autosaveSec: 8,
  hints: true,
  reminders: true,
  highContrast: false,
};

let cache: Prefs | null = null;
const listeners: ((p: Prefs) => void)[] = [];

const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
const asBool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);

function loadPrefs(): Prefs {
  if (cache) return cache;
  cache = { ...DEFAULT_PREFS };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>;
      if (p.tempUnit === "C" || p.tempUnit === "F") cache.tempUnit = p.tempUnit;
      cache.volume = clampNum(p.volume, 0, 1, cache.volume);
      cache.reducedMotion = asBool(p.reducedMotion, cache.reducedMotion);
      cache.sfxVolume = clampNum(p.sfxVolume, 0, 1, cache.sfxVolume);
      cache.musicVolume = clampNum(p.musicVolume, 0, 1, cache.musicVolume);
      cache.ambientVolume = clampNum(p.ambientVolume, 0, 1, cache.ambientVolume);
      cache.uiVolume = clampNum(p.uiVolume, 0, 1, cache.uiVolume);
      cache.muted = asBool(p.muted, cache.muted);
      if (p.timeFormat === "12h" || p.timeFormat === "24h") cache.timeFormat = p.timeFormat;
      cache.uiScale = clampNum(p.uiScale, 0.9, 1.2, cache.uiScale);
      cache.textScale = clampNum(p.textScale, 0.95, 1.15, cache.textScale);
      cache.renderScale = clampNum(p.renderScale, 0.5, 1, cache.renderScale);
      if (p.quality === "performance" || p.quality === "balanced" || p.quality === "high") cache.quality = p.quality;
      cache.maxFps = clampNum(p.maxFps, 0, 240, cache.maxFps);
      cache.shadowsOn = asBool(p.shadowsOn, cache.shadowsOn);
      cache.bloomOn = asBool(p.bloomOn, cache.bloomOn);
      cache.cameraSensitivity = clampNum(p.cameraSensitivity, 0.4, 2, cache.cameraSensitivity);
      cache.invertDrag = asBool(p.invertDrag, cache.invertDrag);
      cache.autosaveSec = clampNum(p.autosaveSec, 4, 60, cache.autosaveSec);
      cache.hints = asBool(p.hints, cache.hints);
      cache.reminders = asBool(p.reminders, cache.reminders);
      cache.highContrast = asBool(p.highContrast, cache.highContrast);
    }
  } catch {
    /* private mode / node — defaults stand */
  }
  return cache;
}

export function getPrefs(): Prefs {
  return { ...loadPrefs() };
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const p = loadPrefs();
  Object.assign(p, patch);
  // Re-clamp every numeric field (a patch can carry anything).
  p.volume = clampNum(p.volume, 0, 1, DEFAULT_PREFS.volume);
  p.sfxVolume = clampNum(p.sfxVolume, 0, 1, DEFAULT_PREFS.sfxVolume);
  p.musicVolume = clampNum(p.musicVolume, 0, 1, DEFAULT_PREFS.musicVolume);
  p.ambientVolume = clampNum(p.ambientVolume, 0, 1, DEFAULT_PREFS.ambientVolume);
  p.uiVolume = clampNum(p.uiVolume, 0, 1, DEFAULT_PREFS.uiVolume);
  p.uiScale = clampNum(p.uiScale, 0.9, 1.2, DEFAULT_PREFS.uiScale);
  p.textScale = clampNum(p.textScale, 0.95, 1.15, DEFAULT_PREFS.textScale);
  p.renderScale = clampNum(p.renderScale, 0.5, 1, DEFAULT_PREFS.renderScale);
  p.maxFps = clampNum(p.maxFps, 0, 240, DEFAULT_PREFS.maxFps);
  p.cameraSensitivity = clampNum(p.cameraSensitivity, 0.4, 2, DEFAULT_PREFS.cameraSensitivity);
  p.autosaveSec = clampNum(p.autosaveSec, 4, 60, DEFAULT_PREFS.autosaveSec);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* non-fatal */
  }
  for (const cb of listeners) cb({ ...p });
  return { ...p };
}

/** The clock seam: "2:31 PM" (12h) or "14:31" (24h) per the player's pref. */
export function fmtClockPref(minutes: number, format: TimeFormat = loadPrefs().timeFormat): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = String(Math.floor(minutes % 60)).padStart(2, "0");
  if (format === "24h") return `${String(h24).padStart(2, "0")}:${m}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${h24 >= 12 ? "PM" : "AM"}`;
}

/** Subscribe to pref changes (settings modal → live HUD refresh). */
export function onPrefsChange(cb: (p: Prefs) => void): void {
  listeners.push(cb);
}

/** TEST SEAM: forget the cached prefs (so a test can vary localStorage). */
export function resetPrefsCache(): void {
  cache = null;
}

// ── Temperature formatting (the ONE display seam) ───────────────────────────

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** "88°F" / "31.2°C" — every on-screen temperature goes through here. */
export function fmtTemp(celsius: number, decimals = 0, unit: TempUnit = loadPrefs().tempUnit): string {
  const v = unit === "F" ? cToF(celsius) : celsius;
  return `${v.toFixed(decimals)}°${unit}`;
}

/** "86–93°F" / "30–34°C" for husbandry band copy. */
export function fmtTempRange(loC: number, hiC: number, unit: TempUnit = loadPrefs().tempUnit): string {
  const lo = unit === "F" ? cToF(loC) : loC;
  const hi = unit === "F" ? cToF(hiC) : hiC;
  return `${Math.round(lo)}–${Math.round(hi)}°${unit}`;
}

/** Localize temperatures inside PROSE ("aim for a 30–34°C basking zone") to
 *  the player's unit — data modules stay pure °C; display converts. */
export function localizeTempText(text: string, unit: TempUnit = loadPrefs().tempUnit): string {
  if (unit === "C") return text;
  return text
    .replace(
      /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*°C/g,
      (_m, a: string, b: string) => `${Math.round(cToF(Number(a)))}–${Math.round(cToF(Number(b)))}°F`,
    )
    .replace(/(\d+(?:\.\d+)?)\s*°C/g, (_m, a: string) => `${Math.round(cToF(Number(a)))}°F`);
}
