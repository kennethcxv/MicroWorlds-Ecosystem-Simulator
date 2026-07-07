/**
 * SETTINGS SCHEMA — the reference-match Settings screen's six tabs
 * (Designs/Settings_Page), declared as pure data over the real Prefs store.
 *
 * Honesty rule: every row either DOES something live right now (pref-wired
 * into a real system), states a true fact (info rows), or says exactly when
 * it will matter (future rows persist their value for the system to come).
 * No dead toggles pretending to work. Unit-tested in tests/settingspage.test.ts.
 */
import type { GwIconName } from "../ui/gwIcons";
import type { Prefs } from "../ui/prefs";

export type SettingsTabId = "graphics" | "audio" | "controls" | "gameplay" | "accessibility" | "camera";

export const SETTINGS_TABS: { id: SettingsTabId; label: string; icon: GwIconName }[] = [
  { id: "graphics", label: "Graphics", icon: "eye" },
  { id: "audio", label: "Audio", icon: "speaker" },
  { id: "controls", label: "Controls", icon: "keyboard" },
  { id: "gameplay", label: "Gameplay", icon: "gecko" },
  { id: "accessibility", label: "Accessibility", icon: "heart" },
  { id: "camera", label: "Camera", icon: "camera" },
];

export type SettingsRowKind = "select" | "slider" | "toggle" | "info" | "action";

export interface SettingsOption {
  v: string | number | boolean;
  label: string;
}

export interface SettingsRow {
  id: string;
  kind: SettingsRowKind;
  label: string;
  /** Context-panel copy shown while the row is focused/hovered. */
  desc: string;
  /** Which pref this row reads/writes (select/slider/toggle rows). */
  pref?: keyof Prefs;
  options?: SettingsOption[];
  min?: number;
  max?: number;
  step?: number;
  /** Slider chip formatter ("110%", "1.4×"). */
  fmt?: (v: number) => string;
  /** Info rows: the fixed value text. */
  info?: string;
  /** Present ⇒ persisted-but-future: the honest note shown on the row. */
  future?: string;
  /** Custom action rows handled by the screen. */
  action?: "save-now" | "reset-game" | "test-sound" | "display-mode";
  danger?: boolean;
}

export interface SettingsGroup {
  title: string;
  rows: SettingsRow[];
}

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  groups: SettingsGroup[];
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const times = (v: number): string => `${v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×`;

export const SETTINGS_SCHEMA: SettingsTab[] = [
  {
    id: "graphics",
    label: "Graphics",
    groups: [
      {
        title: "Display",
        rows: [
          {
            id: "display-mode",
            kind: "action",
            action: "display-mode",
            label: "Display Mode",
            desc: "Windowed keeps the browser chrome; Fullscreen hands the whole screen to the eco-center.",
          },
          {
            id: "render-scale",
            kind: "select",
            pref: "renderScale",
            label: "Render Resolution",
            desc: "How many pixels the 3D habitats render. Lower = faster on modest machines; the UI stays crisp either way.",
            options: [
              { v: 1, label: "Native (100%)" },
              { v: 0.75, label: "Balanced (75%)" },
              { v: 0.5, label: "Performance (50%)" },
            ],
          },
          {
            id: "vsync",
            kind: "info",
            label: "V-Sync",
            desc: "Browsers always sync frames to your display — tearing can't happen here.",
            info: "On · managed by your browser",
          },
          {
            id: "max-fps",
            kind: "select",
            pref: "maxFps",
            label: "Max FPS",
            desc: "Caps the frame rate to save battery and heat. Uncapped follows your display's refresh rate.",
            options: [
              { v: 0, label: "Uncapped" },
              { v: 120, label: "120" },
              { v: 60, label: "60" },
              { v: 30, label: "30" },
            ],
          },
          {
            id: "ui-scale",
            kind: "slider",
            pref: "uiScale",
            label: "UI Scale",
            desc: "Scales the eco-center menus and screens. Habitat HUDs keep their tuned layout.",
            min: 0.9,
            max: 1.2,
            step: 0.05,
            fmt: pct,
          },
        ],
      },
      {
        title: "Graphics",
        rows: [
          {
            id: "quality",
            kind: "select",
            pref: "quality",
            label: "Quality Preset",
            desc: "One knob for the 3D look: High renders at native resolution, Performance drops it for smoothness.",
            options: [
              { v: "high", label: "High" },
              { v: "balanced", label: "Balanced" },
              { v: "performance", label: "Performance" },
            ],
          },
          {
            id: "view-distance",
            kind: "info",
            label: "View Distance",
            desc: "Habitats are intimate worlds — the whole tank is always fully in view.",
            info: "Full · the whole tank, always",
          },
          {
            id: "textures",
            kind: "info",
            label: "Textures",
            desc: "Every model ships with 1K-optimized textures — sharp up close, light to load.",
            info: "High · 1K optimized",
          },
          {
            id: "shadows",
            kind: "toggle",
            pref: "shadowsOn",
            label: "Dynamic Shadows",
            desc: "Animals ground themselves with soft contact shadows today; full dynamic shadows come with the lighting update.",
            future: "Arrives with the dynamic-lighting update — your choice is saved for it.",
          },
          {
            id: "bloom",
            kind: "toggle",
            pref: "bloomOn",
            label: "Bloom & Glow",
            desc: "Lamp glow and waterline shimmer are hand-tuned today; a post-processing pass is planned.",
            future: "Arrives with the post-processing update — your choice is saved for it.",
          },
        ],
      },
    ],
  },
  {
    id: "audio",
    label: "Audio",
    groups: [
      {
        title: "Volume",
        rows: [
          {
            id: "master",
            kind: "slider",
            pref: "volume",
            label: "Master Volume",
            desc: "Everything the eco-center makes — brushes, chimes, squeaks, splashes.",
            min: 0,
            max: 1,
            step: 0.05,
            fmt: pct,
          },
          {
            id: "mute",
            kind: "toggle",
            pref: "muted",
            label: "Mute All",
            desc: "Silences the game without losing your volume balance.",
          },
          {
            id: "sfx",
            kind: "slider",
            pref: "sfxVolume",
            label: "Effects",
            desc: "Care-tool sounds: scrubbing, scooping, pours, squeaks and chimes.",
            min: 0,
            max: 1,
            step: 0.05,
            fmt: pct,
          },
          {
            id: "music",
            kind: "slider",
            pref: "musicVolume",
            label: "Music",
            desc: "A cozy soundtrack is on the roadmap.",
            min: 0,
            max: 1,
            step: 0.05,
            fmt: pct,
            future: "The soundtrack arrives with a future update — your level is saved for it.",
          },
          {
            id: "ambience",
            kind: "slider",
            pref: "ambientVolume",
            label: "Ambience",
            desc: "Room tone — water filters, insect chirps, rain on the paludarium glass.",
            min: 0,
            max: 1,
            step: 0.05,
            fmt: pct,
            future: "Ambient beds arrive with a future update — your level is saved for it.",
          },
        ],
      },
      {
        title: "Engine",
        rows: [
          {
            id: "test-sound",
            kind: "action",
            action: "test-sound",
            label: "Test Sound",
            desc: "Plays the care-complete chime at your current volume.",
          },
          {
            id: "engine",
            kind: "info",
            label: "Sound Engine",
            desc: "Every sound is synthesized live in WebAudio — no audio files, nothing to download.",
            info: "Procedural WebAudio",
          },
        ],
      },
    ],
  },
  {
    id: "controls",
    label: "Controls",
    groups: [
      {
        title: "Keyboard — habitats",
        rows: [
          { id: "k-f", kind: "info", label: "Feed", info: "F", desc: "Opens the Feeding drawer in a habitat." },
          { id: "k-c", kind: "info", label: "Clean", info: "C", desc: "Opens the Cleaning drawer in a habitat." },
          { id: "k-t", kind: "info", label: "Terrain", info: "T", desc: "Opens the Terrain editor in the vivarium." },
          { id: "k-d", kind: "info", label: "Decorate", info: "D", desc: "Opens Decorate mode — the habitat builder." },
          { id: "k-v", kind: "info", label: "Cinematic", info: "V", desc: "Starts the wildlife-cam shot of your animal." },
          { id: "k-h", kind: "info", label: "Help Sheet", info: "H", desc: "Every shortcut, in game." },
          { id: "k-esc", kind: "info", label: "Back / Close", info: "Esc", desc: "Steps back out of any mode, drawer or screen." },
        ],
      },
      {
        title: "Keyboard — editors",
        rows: [
          { id: "k-wer", kind: "info", label: "Move / Rotate / Scale", info: "W · E · R", desc: "Decorate mode's transform tools." },
          { id: "k-16", kind: "info", label: "Tools 1–6", info: "1 – 6", desc: "Picks tools inside the open drawer." },
          { id: "k-brk", kind: "info", label: "Brush Size", info: "[ · ]", desc: "Shrinks / grows the terrain brush." },
          {
            id: "rebind",
            kind: "info",
            label: "Rebinding",
            info: "Future update",
            desc: "Custom key layouts are planned.",
            future: "Key rebinding arrives with a future update.",
          },
        ],
      },
    ],
  },
  {
    id: "gameplay",
    label: "Gameplay",
    groups: [
      {
        title: "General",
        rows: [
          {
            id: "units",
            kind: "select",
            pref: "tempUnit",
            label: "Temperature Units",
            desc: "Applies everywhere: stat strips, details panels, the Care Guide's husbandry bands.",
            options: [
              { v: "F", label: "°F Fahrenheit" },
              { v: "C", label: "°C Celsius" },
            ],
          },
          {
            id: "timefmt",
            kind: "select",
            pref: "timeFormat",
            label: "Time Format",
            desc: "How the eco-center clock reads its day.",
            options: [
              { v: "12h", label: "12-hour (2:31 PM)" },
              { v: "24h", label: "24-hour (14:31)" },
            ],
          },
          {
            id: "autosave",
            kind: "select",
            pref: "autosaveSec",
            label: "Autosave Interval",
            desc: "How often the eco-center saves itself. Manual saves always work too.",
            options: [
              { v: 4, label: "Every 4 seconds" },
              { v: 8, label: "Every 8 seconds" },
              { v: 15, label: "Every 15 seconds" },
              { v: 30, label: "Every 30 seconds" },
              { v: 60, label: "Every minute" },
            ],
          },
          {
            id: "hints",
            kind: "toggle",
            pref: "hints",
            label: "Beginner Hints",
            desc: "The little tip toasts when you open a mode. Veterans can quiet them.",
          },
          {
            id: "reminders",
            kind: "toggle",
            pref: "reminders",
            label: "Care Reminders",
            desc: "Feeding, cleaning and humidity nudges on the home hub and the Habitats page.",
          },
          {
            id: "pause-blur",
            kind: "info",
            label: "Pause on Lost Focus",
            desc: "Leaving the tab pauses the world; nothing fast-forwards behind your back.",
            info: "On · managed by your browser",
          },
        ],
      },
      {
        title: "Data & Saves",
        rows: [
          {
            id: "save-now",
            kind: "action",
            action: "save-now",
            label: "Save Game",
            desc: "Writes the whole eco-center to this browser right now.",
          },
          {
            id: "save-where",
            kind: "info",
            label: "Where Saves Live",
            desc: "Everything stays on this device — clearing the browser's site data erases the eco-center.",
            info: "This browser's local storage",
          },
          {
            id: "reset-game",
            kind: "action",
            action: "reset-game",
            label: "Reset Game",
            desc: "Erases every habitat, photo and supply and starts the eco-center over. Asks twice.",
            danger: true,
          },
        ],
      },
    ],
  },
  {
    id: "accessibility",
    label: "Accessibility",
    groups: [
      {
        title: "Comfort",
        rows: [
          {
            id: "reduced-motion",
            kind: "toggle",
            pref: "reducedMotion",
            label: "Reduce Motion",
            desc: "Calms UI animations and transitions across the whole game.",
          },
          {
            id: "high-contrast",
            kind: "toggle",
            pref: "highContrast",
            label: "High Contrast",
            desc: "Brightens text and strengthens panel borders for readability.",
          },
          {
            id: "text-size",
            kind: "slider",
            pref: "textScale",
            label: "Text Size",
            desc: "Grows the eco-center menus and their text together.",
            min: 0.95,
            max: 1.15,
            step: 0.05,
            fmt: pct,
          },
        ],
      },
      {
        title: "Notes",
        rows: [
          {
            id: "subtitles",
            kind: "info",
            label: "Subtitles",
            desc: "GLASSWATER speaks entirely through visuals — there's no spoken audio to caption.",
            info: "Not needed · no spoken audio",
          },
          {
            id: "colorblind",
            kind: "info",
            label: "Colorblind Support",
            desc: "Status colors always pair with words (Excellent / Needs Work) — palette filters are planned too.",
            info: "Future update",
            future: "Palette filters arrive with a future update.",
          },
        ],
      },
    ],
  },
  {
    id: "camera",
    label: "Camera",
    groups: [
      {
        title: "Feel",
        rows: [
          {
            id: "sensitivity",
            kind: "slider",
            pref: "cameraSensitivity",
            label: "Camera Sensitivity",
            desc: "How quickly dragging orbits the view in every habitat.",
            min: 0.4,
            max: 2,
            step: 0.1,
            fmt: times,
          },
          {
            id: "invert",
            kind: "toggle",
            pref: "invertDrag",
            label: "Invert Drag",
            desc: "Flips the horizontal orbit direction while dragging.",
          },
        ],
      },
      {
        title: "Modes",
        rows: [
          {
            id: "anchored",
            kind: "info",
            label: "Anchored Viewing",
            desc: "Normal viewing leans your head around the tank — it never spins the room.",
            info: "Eco-center view · always on",
          },
          {
            id: "photo-mode",
            kind: "info",
            label: "Photo Mode",
            desc: "The camera button frees the orbit completely; the big shutter saves to your Album.",
            info: "📷 button · free orbit",
          },
          {
            id: "cinematic",
            kind: "info",
            label: "Cinematic",
            desc: "V starts a slow wildlife-cam follow shot of your animal.",
            info: "V · follow shot",
          },
        ],
      },
    ],
  },
];

export function settingsTab(id: SettingsTabId): SettingsTab {
  return SETTINGS_SCHEMA.find((t) => t.id === id) ?? SETTINGS_SCHEMA[0];
}

/** Every pref-wired row across the schema (for reset-tab / tests). */
export function tabPrefs(tab: SettingsTab): (keyof Prefs)[] {
  const keys: (keyof Prefs)[] = [];
  for (const g of tab.groups) for (const r of g.rows) if (r.pref && !r.future) keys.push(r.pref);
  return keys;
}
