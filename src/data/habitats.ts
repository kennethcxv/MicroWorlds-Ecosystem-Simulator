/**
 * HABITATS PAGE DATA — the pure registry + derivations behind the hub's
 * Habitats management screen (reference: Designs/Habitats/Screenshot
 * 2026-07-04 at 12.52.35 AM.png).
 *
 * Everything here is honest game data, never invented display numbers:
 *  · HABITAT_CARDS lists the player's REAL three habitats (the reference's
 *    "Sahara Dunes / Riverbend Haven / Mossy Hollow" are that mockup's
 *    placeholder content — every card on the live page opens a real tank,
 *    and scores/reminders are read live or from the hub stash).
 *  · TEMPLATE_IDEAS keeps the reference's four aspirational builds because
 *    they honestly ARE future ideas — concept cards, clearly not owned.
 *  · keeperLevel derives from real reputation, the streak from real care
 *    days, reminders from real habitat signals.
 *
 * Pure module: no DOM, no Three, no localStorage — persistence and live
 * reads happen in app/ui. Unit-tested in tests/habitatspage.test.ts.
 */
import type { GwIconName } from "../ui/gwIcons";

export type HabitatPageId = "lizard" | "fish" | "frog";

export interface HabitatCardDef {
  id: HabitatPageId;
  /** Default display name — the live layout name overrides when known. */
  name: string;
  typeLabel: string;
  biome: string;
  /** Hero description (the lizard one is the reference card's own copy —
   *  it truthfully describes our tank). */
  blurb: string;
  species: string[];
  speciesIcon: GwIconName;
  /** Real in-game render (canvas capture), served from public/. */
  art: string;
  /** object-position tuning for cover crops. */
  artPos?: string;
}

export const HABITAT_CARDS: readonly HabitatCardDef[] = [
  {
    id: "lizard",
    name: "Sunstone Desert",
    typeLabel: "Leopard Gecko Habitat",
    biome: "Warm desert",
    blurb:
      "A warm desert environment with hides, climbing branches, and plenty of sunbathing spots.",
    species: ["Leopard Gecko"],
    speciesIcon: "gecko",
    art: "/assets/ui/habitats/sunstone_desert.jpg",
    artPos: "center 62%",
  },
  {
    id: "fish",
    name: "Sapphire Stream",
    typeLabel: "Freshwater Aquarium",
    biome: "Planted freshwater",
    blurb:
      "A planted community aquarium — schooling fish, snails and shrimp living over a real nitrogen cycle.",
    species: ["Community fish", "Snails & shrimp"],
    speciesIcon: "fish",
    art: "/assets/ui/habitats/sapphire_stream.jpg",
    artPos: "center 55%",
  },
  {
    id: "frog",
    name: "Emerald Hollow",
    typeLabel: "Tree Frog Paludarium",
    biome: "Rainforest",
    blurb:
      "A humid rainforest paludarium — a soaking pond, leaf litter and misted jungle plants around one small frog.",
    species: ["Red-Eyed Tree Frog"],
    speciesIcon: "frog",
    art: "/assets/ui/habitats/emerald_hollow.jpg",
    artPos: "center 68%",
  },
];

export function habitatCardById(id: string): HabitatCardDef | undefined {
  return HABITAT_CARDS.find((h) => h.id === id);
}

// ── Templates / New Ideas ──────────────────────────────────────────────────

export interface TemplateIdeaDef {
  id: string;
  name: string;
  typeLabel: string;
  icon: GwIconName;
  /** Gradient stops for the procedural concept-art tile (no real art yet —
   *  these builds don't exist, so they never borrow another tank's render). */
  palette: [string, string];
  note: string;
}

export const TEMPLATE_IDEAS: readonly TemplateIdeaDef[] = [
  {
    id: "rainforest_canopy",
    name: "Rainforest Canopy",
    typeLabel: "Tree Frog Vivarium",
    icon: "sprout",
    palette: ["#2a6136", "#0a1c10"],
    note: "A taller, denser canopy build with layered climbing vines.",
  },
  {
    id: "desert_outcrop",
    name: "Desert Outcrop",
    typeLabel: "Leopard Gecko Habitat",
    icon: "mountains",
    palette: ["#7a5a30", "#1c130a"],
    note: "Stacked rocky ledges and deep shaded crevices to explore.",
  },
  {
    id: "coastal_tidepool",
    name: "Coastal Tidepool",
    typeLabel: "Paludarium",
    icon: "drop",
    palette: ["#1a6d78", "#0a1e24"],
    note: "Half water, half shore — a rockpool world at the glass.",
  },
  {
    id: "arid_badlands",
    name: "Arid Badlands",
    typeLabel: "Bearded Dragon Habitat",
    icon: "sun",
    palette: ["#8a4a24", "#160d08"],
    note: "A big dragon needs a big desert — wide basking flats.",
  },
];

/** Honest status line for the Templates row + the Create New Habitat card. */
export const TEMPLATES_PENDING_NOTE =
  "Habitat templates arrive with a future update — these are the builds on the drawing board.";
export const CREATE_HABITAT_NOTE =
  "New habitat construction arrives with the eco-center's next restoration update.";

// ── Score words ────────────────────────────────────────────────────────────

/** Same thresholds the fish/frog HUD score cards use — a habitat must read
 *  the SAME word here as on its own screen. */
export function scoreWord(score: number): string {
  return score >= 88 ? "Excellent" : score >= 75 ? "Thriving" : score >= 60 ? "Stable" : score >= 40 ? "Struggling" : "Critical";
}

// ── Eco-Keeper level (derived from real reputation) ────────────────────────

export const KEEPER_LEVEL_SPAN = 250;

export interface KeeperLevel {
  level: number;
  /** Reputation earned inside the current level (0..span-1). */
  into: number;
  span: number;
  toNext: number;
}

/** Keeper level is a fixed presentation of REAL reputation: 250 ★ per level,
 *  level 1 at 0 ★. No hidden XP system — earn reputation, the level follows. */
export function keeperLevel(reputation: number): KeeperLevel {
  const rep = Math.max(0, Math.floor(reputation));
  const level = Math.floor(rep / KEEPER_LEVEL_SPAN) + 1;
  const into = rep % KEEPER_LEVEL_SPAN;
  return { level, into, span: KEEPER_LEVEL_SPAN, toNext: KEEPER_LEVEL_SPAN - into };
}

// ── Care streak ────────────────────────────────────────────────────────────

export interface CareStreak {
  /** Local day key "YYYY-MM-DD" of the last counted care day. */
  lastDay: string | null;
  days: number;
}

export const EMPTY_STREAK: CareStreak = { lastDay: null, days: 0 };

function epochDay(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map((n) => Number.parseInt(n, 10));
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

/** Advance the streak for a care visit on `dayKey`: same day keeps it,
 *  the very next day extends it, any gap honestly restarts at 1. */
export function bumpStreak(prev: CareStreak, dayKey: string): CareStreak {
  if (!prev.lastDay || prev.days <= 0) return { lastDay: dayKey, days: 1 };
  const gap = epochDay(dayKey) - epochDay(prev.lastDay);
  if (gap <= 0) return prev;
  if (gap === 1) return { lastDay: dayKey, days: prev.days + 1 };
  return { lastDay: dayKey, days: 1 };
}

export function streakCaption(days: number): string {
  if (days <= 0) return "Care for a habitat today to start one";
  if (days === 1) return "Day one — come back tomorrow!";
  return "Keep it going!";
}

// ── Reminders (derived from real habitat signals) ──────────────────────────

export type ReminderTone = "red" | "amber" | "blue";

export interface HabitatSignals {
  score?: number | null;
  /** 0..100 — below the threshold means cleaning/water care is due. */
  cleanliness?: number | null;
  /** 0..100 — LOW means hungry. */
  hunger?: number | null;
  /** Frog ambient humidity %. */
  humidity?: number | null;
  /** Frog skin hydration 0..100. */
  hydration?: number | null;
  /** Aquarium nitrate mg/L — HIGH means a water change is coming due. */
  nitrate?: number | null;
}

export interface ReminderDef {
  habitatId: HabitatPageId;
  habitatName: string;
  label: string;
  tone: ReminderTone;
}

export const REMINDER_RULES = {
  hunger: 45,
  cleanliness: 70,
  /** Below the frog band's floor (ideal 70–95 %, FrogNeedsSystem). */
  humidityLo: 70,
  hydration: 60,
  nitrateHi: 40,
  scoreAttention: 60,
} as const;

const TONE_RANK: Record<ReminderTone, number> = { red: 0, amber: 1, blue: 2 };

/** Turn each habitat's last-known signals into the sidebar's reminder list.
 *  Unknown (null/undefined) signals never fire — a never-visited habitat
 *  stays quiet instead of guessing. Most urgent tones sort first. */
export function deriveReminders(
  habitats: readonly { id: HabitatPageId; name: string; signals: HabitatSignals }[],
): ReminderDef[] {
  const out: ReminderDef[] = [];
  for (const h of habitats) {
    const s = h.signals;
    const add = (label: string, tone: ReminderTone): void => {
      out.push({ habitatId: h.id, habitatName: h.name, label, tone });
    };
    if (s.hunger != null && s.hunger < REMINDER_RULES.hunger) add("Feeding time", "red");
    if (s.cleanliness != null && s.cleanliness < REMINDER_RULES.cleanliness) {
      add(h.id === "fish" ? "Water change due" : h.id === "lizard" ? "Cleaning due" : "Tidy the tank", "blue");
    }
    if (h.id === "fish" && s.nitrate != null && s.nitrate > REMINDER_RULES.nitrateHi) {
      add("Nitrate creeping up — plan a water change", "amber");
    }
    if (h.id === "frog" && s.humidity != null && s.humidity < REMINDER_RULES.humidityLo) {
      add("Check humidity", "amber");
    }
    if (h.id === "frog" && s.hydration != null && s.hydration < REMINDER_RULES.hydration) {
      add("Offer a soak — hydration is low", "amber");
    }
    if (s.score != null && s.score < REMINDER_RULES.scoreAttention) add("Habitat needs attention", "amber");
  }
  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

// ── Recently visited ───────────────────────────────────────────────────────

/** Human label for a real visit timestamp ("Just now" … "3 days ago"). */
export function visitLabel(nowMs: number, thenMs: number | null | undefined): string {
  if (thenMs == null || thenMs <= 0 || thenMs > nowMs) return "Not visited yet";
  const mins = Math.floor((nowMs - thenMs) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** Most recently visited first; never-visited habitats sink to the end. */
export function sortByRecent<T extends { lastVisit?: number | null }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (b.lastVisit ?? 0) - (a.lastVisit ?? 0));
}

// ── Sidebar promo ──────────────────────────────────────────────────────────

/** Honest shop promo — the Supply Shop really sells feeder + fish-food packs. */
export const HABITATS_PROMO = {
  icon: "sprout" as GwIconName,
  text: "Fresh feeder packs and fish food are stocked in the Supply Shop!",
  cta: "Visit Shop",
};
