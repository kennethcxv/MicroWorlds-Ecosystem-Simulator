/**
 * HABITAT FILTERS REGISTRY — the data-driven list behind the Terrain editor's
 * FILTERS tab (reference: Designs/Gecko "Filters" image — left filter list,
 * HIDE COVERAGE main content, gradient legend + analysis minimap, ABOUT THIS
 * FILTER + TIPS panel, Overlay Opacity / Intensity / Reset Filters).
 *
 * ONE entry per analysis lens: list row (icon + tint), main copy (description,
 * recommendation), ABOUT paragraphs + TIPS card, and the overlay's colour
 * scale + legend labels. Live scores/status come from the scene
 * (`filterReadout`) — the score→status mapping and colour-ramp sampling are
 * pure and unit-tested here. No DOM/Three imports.
 */

export interface FilterColorStop {
  /** Position along the ramp, 0 (legend low) → 1 (legend high). */
  t: number;
  color: string;
}

export interface HabitatFilterDef {
  id: string;
  name: string;
  /** Compact label for the 2-column lens grid (≤ 10 chars). */
  short: string;
  /** gw icon name for the list row + title. */
  icon: string;
  /** List-row icon tint (each filter keeps its own accent, per the reference). */
  tint: string;
  /** One-liner under the title. */
  description: string;
  /** Two short ABOUT THIS FILTER paragraphs. */
  about: [string, string];
  /** The TIPS card body. */
  tips: string;
  /** "Recommended: …" line under the score. */
  recommendation: string;
  /** Labels for the ends of the gradient legend bar. */
  legend: { low: string; high: string };
  /** Overlay colour ramp, ascending t = 0 → 1. */
  scale: FilterColorStop[];
}

export const HABITAT_FILTERS: HabitatFilterDef[] = [
  {
    id: "heat",
    name: "Heat",
    short: "Heat",
    icon: "thermo",
    tint: "#ef7a5e",
    description: "Maps warm and cool zones across the habitat floor.",
    about: [
      "Heat shows how the basking lamp's warmth spreads across the habitat and where the cool side begins.",
      "Leopard geckos thermoregulate by moving between warm and cool zones, so both must stay reachable.",
    ],
    tips: "Keep the basking zone around 31°C with a clear cool retreat on the far side — never heat the whole floor.",
    recommendation: "Recommended: 28–34°C basking",
    legend: { low: "Cool", high: "Hot" },
    scale: [
      { t: 0, color: "#4f86c0" },
      { t: 0.45, color: "#ead65c" },
      { t: 0.75, color: "#f0913f" },
      { t: 1, color: "#e04f38" },
    ],
  },
  {
    id: "humidity",
    name: "Humidity",
    short: "Humidity",
    icon: "drop",
    tint: "#57b8ff",
    description: "Shows damp patches and how moisture spreads from them.",
    about: [
      "Humidity tracks the damp patches painted on the substrate and the ambient moisture they create.",
      "Desert species want a dry floor overall with one small humid retreat for comfortable shedding.",
    ],
    tips: "Paint a small damp patch near a hide to make a humid retreat — keep the rest of the floor dry.",
    recommendation: "Recommended: 30–45% ambient",
    legend: { low: "Dry", high: "Humid" },
    scale: [
      { t: 0, color: "#d8b678" },
      { t: 0.5, color: "#6fb3c9" },
      { t: 1, color: "#3f7fd0" },
    ],
  },
  {
    id: "hide_coverage",
    name: "Hide Coverage",
    short: "Hides",
    icon: "leaf",
    tint: "#8ce25a",
    description: "Measures how well the habitat provides secure hiding spots.",
    about: [
      "Hide Coverage evaluates the availability and distribution of secure hiding spaces.",
      "Leopard geckos need plenty of covered areas to feel safe and reduce stress.",
    ],
    tips: "Add more hides or broad-leaf plants in red/orange areas to improve coverage and reduce stress.",
    recommendation: "Recommended: 70%+",
    legend: { low: "Low", high: "High" },
    scale: [
      { t: 0, color: "#e04f38" },
      { t: 0.35, color: "#f0913f" },
      { t: 0.6, color: "#ead65c" },
      { t: 1, color: "#7ac74f" },
    ],
  },
  {
    id: "cleanliness",
    name: "Cleanliness",
    short: "Clean",
    icon: "sparkle",
    tint: "#9be0d8",
    description: "Maps grime, droppings and fouled patches on the floor.",
    about: [
      "Cleanliness reads the live dirt map — every fouled patch, dropping and high-traffic smudge on the substrate.",
      "A dirty floor stresses your gecko and breeds bacteria; hides, dishes and favourite corners foul fastest.",
    ],
    tips: "Scoop droppings quickly and spot-clean the red patches — the areas around dishes and hides foul fastest.",
    recommendation: "Recommended: 80%+ clean",
    legend: { low: "Grimy", high: "Spotless" },
    scale: [
      { t: 0, color: "#7a4a2a" },
      { t: 0.45, color: "#c98d4e" },
      { t: 0.75, color: "#cfd3a8" },
      { t: 1, color: "#7ac74f" },
    ],
  },
  {
    id: "comfort",
    name: "Comfort",
    short: "Comfort",
    icon: "house",
    tint: "#e8a0bd",
    description: "Where your gecko feels at ease — warmth, cover and clean ground combined.",
    about: [
      "Comfort blends the lenses a keeper juggles: is it the right temperature, is there cover nearby, is the ground clean?",
      "The green areas are where your gecko will happily linger; red patches are spots it will avoid or stress through.",
    ],
    tips: "Chase the red: a hide near the warm end, a clean floor and a cool retreat turn the whole map green.",
    recommendation: "Recommended: 75%+ at ease",
    legend: { low: "Stressed", high: "At ease" },
    scale: [
      { t: 0, color: "#e04f38" },
      { t: 0.4, color: "#f0913f" },
      { t: 0.65, color: "#ead65c" },
      { t: 1, color: "#7ac74f" },
    ],
  },
  {
    id: "enrichment",
    name: "Enrichment",
    short: "Enrich",
    icon: "sprout",
    tint: "#8fd8a0",
    description: "Things to do per corner — climbing, digging, exploring and hiding.",
    about: [
      "Enrichment maps how much there is to DO in each part of the habitat: climbable decor, open digging sand, hides to explore.",
      "A bored gecko paces the glass; a busy habitat keeps it curious, active and confident.",
    ],
    tips: "Every zone should offer something — a perch rock here, open dig sand there, a hide within a short walk.",
    recommendation: "Recommended: 60%+ engaging",
    legend: { low: "Bare", high: "Engaging" },
    scale: [
      { t: 0, color: "#5a5148" },
      { t: 0.45, color: "#b8a86a" },
      { t: 1, color: "#69c96f" },
    ],
  },
  {
    id: "clutter",
    name: "Clutter",
    short: "Clutter",
    icon: "clutter",
    tint: "#f0913f",
    description: "Highlights crowded areas and clear walking space.",
    about: [
      "Clutter measures how densely decor fills each part of the floor against the open space around it.",
      "A natural habitat mixes sheltered corners with clear runs — a fully packed floor blocks movement.",
    ],
    tips: "Keep an open lane through the middle of the habitat and cluster decor toward the corners and back.",
    recommendation: "Recommended: 20–45% cover",
    legend: { low: "Open", high: "Crowded" },
    scale: [
      { t: 0, color: "#7ac74f" },
      { t: 0.55, color: "#ead65c" },
      { t: 1, color: "#e04f38" },
    ],
  },
  {
    id: "dig_zones",
    name: "Dig Zones",
    short: "Digging",
    icon: "dig",
    tint: "#b48ce8",
    description: "Shows open sand where your gecko can dig comfortably.",
    about: [
      "Dig Zones marks the loose, unobstructed substrate a gecko can actually dig and reshape.",
      "Digging is natural enrichment — buried decor and steep slopes shrink the diggable floor.",
    ],
    tips: "Leave a few palm-sized patches of open sand clear of decor so digging always has somewhere to go.",
    recommendation: "Recommended: 30%+ open sand",
    legend: { low: "Blocked", high: "Diggable" },
    scale: [
      { t: 0, color: "#5a5148" },
      { t: 0.5, color: "#8b7fc9" },
      { t: 1, color: "#b48ce8" },
    ],
  },
  {
    id: "traffic_flow",
    name: "Traffic Flow",
    short: "Traffic",
    icon: "traffic",
    tint: "#f0b64b",
    description: "Traces how freely your gecko can move around the habitat.",
    about: [
      "Traffic Flow checks which parts of the floor the gecko can reach and how wide the corridors between decor are.",
      "Dead ends and pinch points cause pacing and stress — every zone should connect back to the open floor.",
    ],
    tips: "Widen tight gaps between large rocks and keep at least one clear route between the warm and cool sides.",
    recommendation: "Recommended: 85%+ reachable",
    legend: { low: "Blocked", high: "Open" },
    scale: [
      { t: 0, color: "#e04f38" },
      { t: 0.5, color: "#f0b64b" },
      { t: 1, color: "#7ac74f" },
    ],
  },
  {
    id: "lighting",
    name: "Lighting",
    short: "Light",
    icon: "sun",
    tint: "#ffd76a",
    description: "Maps bright basking light against shaded retreats.",
    about: [
      "Lighting shows how the lamp's glow falls across the floor and where shade remains.",
      "Geckos need both — bright warmth for basking and dim cover to retreat from the light.",
    ],
    tips: "Aim the lamp at one end and keep hides in the shaded half so bright and dark are always a short walk apart.",
    recommendation: "Recommended: bright + shaded zones",
    legend: { low: "Shaded", high: "Bright" },
    scale: [
      { t: 0, color: "#2c3f66" },
      { t: 0.55, color: "#c9a45c" },
      { t: 1, color: "#ffd76a" },
    ],
  },
];

export function filterById(id: string): HabitatFilterDef | null {
  return HABITAT_FILTERS.find((f) => f.id === id) ?? null;
}

/** Score → status word + tone (the reference's "72 · Good"). */
export function filterStatus(score: number): { word: string; tone: "good" | "warn" | "bad" } {
  if (score >= 85) return { word: "Excellent", tone: "good" };
  if (score >= 70) return { word: "Good", tone: "good" };
  if (score >= 50) return { word: "Fair", tone: "warn" };
  return { word: "Needs Work", tone: "bad" };
}

/** Sample a colour ramp at t (clamped 0..1) → lowercase #rrggbb. */
export function scaleColor(scale: FilterColorStop[], t: number): string {
  const x = Math.max(0, Math.min(1, t));
  let a = scale[0];
  let b = scale[scale.length - 1];
  for (let i = 0; i < scale.length - 1; i++) {
    if (x >= scale[i].t && x <= scale[i + 1].t) {
      a = scale[i];
      b = scale[i + 1];
      break;
    }
  }
  const f = b.t === a.t ? 0 : (x - a.t) / (b.t - a.t);
  const pa = parseInt(a.color.slice(1), 16);
  const pb = parseInt(b.color.slice(1), 16);
  const ch = (sa: number, sb: number): number => Math.round(sa + (sb - sa) * f);
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255);
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255);
  const bl = ch(pa & 255, pb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}
