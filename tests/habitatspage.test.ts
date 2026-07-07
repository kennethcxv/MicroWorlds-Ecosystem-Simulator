/**
 * Habitats page data contract — the registry + pure derivations behind the
 * hub's Habitats management screen (src/data/habitats.ts).
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CREATE_HABITAT_NOTE,
  EMPTY_STREAK,
  HABITAT_CARDS,
  HABITATS_PROMO,
  KEEPER_LEVEL_SPAN,
  REMINDER_RULES,
  TEMPLATE_IDEAS,
  TEMPLATES_PENDING_NOTE,
  bumpStreak,
  deriveReminders,
  habitatCardById,
  keeperLevel,
  scoreWord,
  sortByRecent,
  streakCaption,
  visitLabel,
  type HabitatSignals,
} from "../src/data/habitats";

describe("habitat cards (the player's real habitats)", () => {
  it("lists exactly the three live habitats with their real names", () => {
    expect(HABITAT_CARDS.map((h) => h.id)).toEqual(["lizard", "fish", "frog"]);
    expect(HABITAT_CARDS.map((h) => h.name)).toEqual(["Sunstone Desert", "Sapphire Stream", "Emerald Hollow"]);
    expect(new Set(HABITAT_CARDS.map((h) => h.id)).size).toBe(3);
  });

  it("every card is fully authored (type, biome, blurb, species, art)", () => {
    for (const h of HABITAT_CARDS) {
      expect(h.typeLabel.length, h.id).toBeGreaterThan(4);
      expect(h.biome.length, h.id).toBeGreaterThan(3);
      expect(h.blurb.length, h.id).toBeGreaterThan(30);
      expect(h.species.length, h.id).toBeGreaterThan(0);
    }
  });

  it("keeps the reference hero copy for the gecko habitat (it is true of our tank)", () => {
    expect(habitatCardById("lizard")?.blurb).toBe(
      "A warm desert environment with hides, climbing branches, and plenty of sunbathing spots.",
    );
  });

  it("card art is a real repo asset (never the reference screenshot)", () => {
    for (const h of HABITAT_CARDS) {
      expect(h.art.startsWith("/assets/ui/habitats/"), h.id).toBe(true);
      const onDisk = resolve(process.cwd(), "public", h.art.replace(/^\//, ""));
      expect(existsSync(onDisk), `${h.id} → ${h.art}`).toBe(true);
    }
  });
});

describe("template ideas (honest future concepts)", () => {
  it("carries the four reference concepts, none colliding with a real habitat", () => {
    expect(TEMPLATE_IDEAS.map((t) => t.name)).toEqual([
      "Rainforest Canopy",
      "Desert Outcrop",
      "Coastal Tidepool",
      "Arid Badlands",
    ]);
    const real = new Set<string>(HABITAT_CARDS.map((h) => h.id));
    for (const t of TEMPLATE_IDEAS) {
      expect(real.has(t.id), t.id).toBe(false);
      expect(t.note.length, t.id).toBeGreaterThan(10);
      expect(t.palette).toHaveLength(2);
    }
  });

  it("labels templates and Create New as future work, not owned content", () => {
    expect(TEMPLATES_PENDING_NOTE).toMatch(/future update/i);
    expect(CREATE_HABITAT_NOTE).toMatch(/update/i);
  });
});

describe("scoreWord", () => {
  it("matches the fish/frog HUD thresholds exactly", () => {
    expect(scoreWord(95)).toBe("Excellent");
    expect(scoreWord(88)).toBe("Excellent");
    expect(scoreWord(87)).toBe("Thriving");
    expect(scoreWord(75)).toBe("Thriving");
    expect(scoreWord(60)).toBe("Stable");
    expect(scoreWord(45)).toBe("Struggling");
    expect(scoreWord(10)).toBe("Critical");
  });
});

describe("keeperLevel (derived from real reputation)", () => {
  it("is a fixed 250-★-per-level presentation", () => {
    expect(keeperLevel(0)).toEqual({ level: 1, into: 0, span: KEEPER_LEVEL_SPAN, toNext: 250 });
    expect(keeperLevel(249)).toEqual({ level: 1, into: 249, span: 250, toNext: 1 });
    expect(keeperLevel(250).level).toBe(2);
    expect(keeperLevel(1250).level).toBe(6);
    expect(keeperLevel(-10).level).toBe(1); // clamps, never level 0
  });
});

describe("care streak", () => {
  it("starts at one, holds within a day, extends next day, resets on gaps", () => {
    const d1 = bumpStreak(EMPTY_STREAK, "2026-06-30");
    expect(d1).toEqual({ lastDay: "2026-06-30", days: 1 });
    expect(bumpStreak(d1, "2026-06-30")).toEqual(d1); // same day: unchanged
    const d2 = bumpStreak(d1, "2026-07-01"); // month boundary is consecutive
    expect(d2).toEqual({ lastDay: "2026-07-01", days: 2 });
    expect(bumpStreak(d2, "2026-07-04")).toEqual({ lastDay: "2026-07-04", days: 1 }); // gap resets
  });

  it("captions honestly at zero, one and many days", () => {
    expect(streakCaption(0)).toMatch(/start one/i);
    expect(streakCaption(1)).toMatch(/day one/i);
    expect(streakCaption(12)).toBe("Keep it going!");
  });
});

describe("deriveReminders", () => {
  const quiet: HabitatSignals = { score: 95, cleanliness: 94, hunger: 80 };

  it("stays silent for healthy or never-visited habitats", () => {
    expect(
      deriveReminders([
        { id: "lizard", name: "Sunstone Desert", signals: quiet },
        { id: "frog", name: "Emerald Hollow", signals: {} }, // never visited: no guessing
      ]),
    ).toEqual([]);
  });

  it("fires the reference trio from real signals with per-habitat copy", () => {
    const out = deriveReminders([
      { id: "fish", name: "Sapphire Stream", signals: { cleanliness: 55 } },
      { id: "frog", name: "Emerald Hollow", signals: { humidity: 54 } },
      { id: "lizard", name: "Sunstone Desert", signals: { hunger: 20 } },
    ]);
    expect(out.map((r) => r.label)).toEqual(["Feeding time", "Check humidity", "Water change due"]);
    expect(out.map((r) => r.tone)).toEqual(["red", "amber", "blue"]); // urgency ordering
    expect(out[0].habitatName).toBe("Sunstone Desert");
  });

  it("adds the aquarium nitrate early-warning", () => {
    const out = deriveReminders([
      { id: "fish", name: "Sapphire Stream", signals: { nitrate: REMINDER_RULES.nitrateHi + 5 } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toMatch(/nitrate/i);
    expect(out[0].tone).toBe("amber");
  });
});

describe("recently visited", () => {
  const NOW = Date.UTC(2026, 6, 4, 12, 0, 0);

  it("labels real timestamps in human terms", () => {
    expect(visitLabel(NOW, NOW - 20_000)).toBe("Just now");
    expect(visitLabel(NOW, NOW - 5 * 60_000)).toBe("5 min ago");
    expect(visitLabel(NOW, NOW - 3 * 3_600_000)).toBe("3 hours ago");
    expect(visitLabel(NOW, NOW - 26 * 3_600_000)).toBe("Yesterday");
    expect(visitLabel(NOW, NOW - 3 * 86_400_000)).toBe("3 days ago");
    expect(visitLabel(NOW, null)).toBe("Not visited yet");
    expect(visitLabel(NOW, NOW + 60_000)).toBe("Not visited yet"); // future = corrupt, honest fallback
  });

  it("sorts most recent first with never-visited last", () => {
    const sorted = sortByRecent([
      { id: "a", lastVisit: null },
      { id: "b", lastVisit: NOW - 1000 },
      { id: "c", lastVisit: NOW - 99_000 },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sidebar promo", () => {
  it("advertises what the shop really sells", () => {
    expect(HABITATS_PROMO.text).toMatch(/Supply Shop/);
    expect(HABITATS_PROMO.text).toMatch(/feeder|food/i);
    expect(HABITATS_PROMO.cta).toBe("Visit Shop");
  });
});
