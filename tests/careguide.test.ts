/**
 * CARE GUIDE DATA — the pure content registry behind the Care Guide screen
 * (src/data/careGuide.ts). Guards the reference contract: eight tabs, the
 * Habitat Setup tab's exact essentials/strip/checklist, temperatures derived
 * from the researched LEOPARD_GECKO bands (never hand-copied prose numbers),
 * feeder cards derived from the real FOOD_TYPES table, REAL in-game imagery
 * (every referenced file exists on disk), and readable full-sentence notes.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARE_FACTS,
  CARE_GUIDE_DEFAULT_TAB,
  CARE_GUIDE_TABS,
  careTabById,
  type CareTabDef,
  type CareTemp,
  type CareValue,
} from "../src/data/careGuide";
import { LEOPARD_GECKO } from "../src/habitats/HabitatSpecies";
import { FOOD_TYPES } from "../src/habitats/lizard/LizardNutrition";

const isTemp = (v: CareValue): v is CareTemp => typeof v !== "string";

function allValues(tab: CareTabDef): CareValue[] {
  const vals: CareValue[] = tab.strip.map((s) => s.value);
  for (const g of tab.quickRef.groups) for (const f of g.facts ?? []) vals.push(f.value);
  return vals;
}

describe("care guide tabs", () => {
  it("carries the eight reference tabs in order, uniquely", () => {
    expect(CARE_GUIDE_TABS.map((t) => t.label)).toEqual([
      "Overview",
      "Feeding",
      "Habitat Setup",
      "Heating & Lighting",
      "Health",
      "Behavior",
      "Shedding",
      "FAQ",
    ]);
    expect(new Set(CARE_GUIDE_TABS.map((t) => t.id)).size).toBe(8);
  });

  it("opens on Habitat Setup (the reference's active tab)", () => {
    expect(CARE_GUIDE_DEFAULT_TAB).toBe("habitat");
    expect(careTabById("habitat").label).toBe("Habitat Setup");
    expect(() => careTabById("nope" as never)).toThrow();
  });

  it("gives every tab a complete hero and a right-hand quick reference", () => {
    for (const tab of CARE_GUIDE_TABS) {
      expect(tab.hero.title.length, tab.id).toBeGreaterThan(1);
      expect(tab.hero.tagline.length, tab.id).toBeGreaterThan(8);
      expect(tab.hero.body.length, tab.id).toBeGreaterThan(20);
      expect(tab.quickRef.groups.length, tab.id).toBeGreaterThan(0);
      // No tab may render empty: cards, or an FAQ list.
      const cardCount = tab.sections.reduce((n, s) => n + (s.cards?.length ?? 0), 0);
      expect(cardCount + (tab.faq?.length ?? 0), tab.id).toBeGreaterThan(2);
    }
  });

  it("every card has body copy and expandable learn-more bullets", () => {
    for (const tab of CARE_GUIDE_TABS)
      for (const sect of tab.sections)
        for (const card of sect.cards ?? []) {
          expect(card.title.length, `${tab.id}/${card.title}`).toBeGreaterThan(2);
          expect(card.body.length, `${tab.id}/${card.title}`).toBeGreaterThan(12);
          expect(card.more.length, `${tab.id}/${card.title}`).toBeGreaterThanOrEqual(2);
        }
  });
});

describe("habitat setup tab (the reference page)", () => {
  const tab = careTabById("habitat");

  it("matches the reference hero copy", () => {
    expect(tab.hero.tagline).toBe("Create a safe, comfortable desert home for your leopard gecko.");
    expect(tab.hero.body).toContain("thermoregulation");
    expect(tab.hero.art).toContain("/assets/ui/care_guide/");
  });

  it("carries the five reference strip items", () => {
    expect(tab.strip.map((s) => s.label)).toEqual(["Min Enclosure", "Warm Hide", "Cool Hide", "Substrate", "Enrichment"]);
    expect(tab.strip[0].value).toBe("20 gal long");
    expect(tab.strip[3].value).toBe("Loose & safe");
    expect(tab.strip[4].value).toBe("Climb, hide, explore");
  });

  it("lists the eight reference essentials cards", () => {
    const titles = (tab.sections[0].cards ?? []).map((c) => c.title);
    expect(titles).toEqual([
      "Enclosure Size",
      "Hides & Shelter",
      "Safe Substrate",
      "Water Dish",
      "Climbing Enrichment",
      "Plants & Decor",
      "Cleaning Basics",
      "Essential Equipment",
    ]);
  });

  it("checklist has the reference's eight items with only monitoring left open", () => {
    const items = tab.checklist!.items;
    expect(items).toHaveLength(8);
    expect(items.filter((i) => !i.done)).toHaveLength(1);
    expect(items[items.length - 1]).toEqual({ label: "Monitor temps & humidity", done: false });
  });

  it("quick reference derives temps and humidity from the researched care profile", () => {
    const temps = tab.quickRef.groups.find((g) => g.title === "Recommended Temperatures")!;
    const warm = temps.facts!.find((f) => f.label === "Warm Side")!.value as CareTemp;
    const cool = temps.facts!.find((f) => f.label === "Cool Side")!.value as CareTemp;
    expect(warm.tempC).toEqual(LEOPARD_GECKO.ideal.baskingC);
    expect(cool.tempC).toEqual(LEOPARD_GECKO.ideal.coolC);
    const hum = tab.quickRef.groups.find((g) => g.dial)!.dial!;
    expect([hum.lo, hum.hi]).toEqual(LEOPARD_GECKO.ideal.humidity);
    expect(hum.caption).toBe("Ideal range");
    const light = tab.quickRef.groups.find((g) => g.title === "Lighting Notes")!;
    expect(light.note).toContain("12–14 hour");
    expect(light.note).toContain("UVB is optional");
  });
});

describe("temperatures stay °C data, formatted at render", () => {
  it("all temp values are plausible celsius bands (lo ≤ hi, 15–40°C)", () => {
    for (const tab of CARE_GUIDE_TABS)
      for (const v of allValues(tab))
        if (isTemp(v)) {
          expect(v.tempC[0]).toBeLessThanOrEqual(v.tempC[1]);
          expect(v.tempC[0]).toBeGreaterThanOrEqual(15);
          expect(v.tempC[1]).toBeLessThanOrEqual(40);
        }
  });

  it("no strip or fact value hand-copies a °F string (unit lock-in)", () => {
    for (const tab of CARE_GUIDE_TABS)
      for (const v of allValues(tab))
        if (typeof v === "string") expect(v).not.toMatch(/°F|°C/);
  });
});

describe("feeding tab derives from the real nutrition table", () => {
  const tab = careTabById("feeding");
  const feeders = tab.sections.find((s) => s.title === "Feeder Insects")!.cards!;

  it("has one card per FOOD_TYPES entry, carrying its label and note", () => {
    const kinds = Object.keys(FOOD_TYPES) as Array<keyof typeof FOOD_TYPES>;
    expect(feeders).toHaveLength(kinds.length);
    for (const kind of kinds) {
      const f = FOOD_TYPES[kind];
      const card = feeders.find((c) => c.title === f.label);
      expect(card, f.label).toBeTruthy();
      expect(card!.body).toContain(f.note);
      expect(card!.more[0]).toContain(`Satiety ${f.satiety}`);
    }
  });

  it("marks treats as treats", () => {
    const wax = feeders.find((c) => c.title === FOOD_TYPES.waxworm.label)!;
    expect(wax.body).toContain("treat");
  });
});

describe("faq", () => {
  it("faq answers the safety questions from the species profile", () => {
    const faq = careTabById("faq").faq!;
    expect(faq.length).toBeGreaterThanOrEqual(8);
    for (const f of faq) {
      expect(f.q.length).toBeGreaterThan(8);
      expect(f.a.length).toBeGreaterThan(30);
    }
    expect(faq.some((f) => /live together/i.test(f.q) && /solitary/i.test(f.a))).toBe(true);
    expect(faq.some((f) => /swim/i.test(f.q) && /cannot swim/i.test(f.a))).toBe(true);
    // Tail autotomy is the classic handling hazard — the FAQ must cover it.
    expect(faq.some((f) => /tail/i.test(f.q) && /never grab|regrows/i.test(f.a))).toBe(true);
  });
});

describe("real in-game imagery", () => {
  const allArt = (): Array<{ where: string; path: string }> => {
    const out: Array<{ where: string; path: string }> = [];
    for (const tab of CARE_GUIDE_TABS) {
      if (tab.hero.art) out.push({ where: `${tab.id} hero`, path: tab.hero.art });
      for (const sect of tab.sections)
        for (const card of sect.cards ?? []) if (card.art) out.push({ where: `${tab.id}/${card.title}`, path: card.art });
    }
    return out;
  };

  it("every tab except the FAQ carries a real hero capture with a caption", () => {
    for (const tab of CARE_GUIDE_TABS) {
      if (tab.id === "faq") continue;
      expect(tab.hero.art, tab.id).toBeTruthy();
      expect(tab.hero.caption, tab.id).toBeTruthy();
    }
  });

  it("every referenced image exists on disk under public/ (no dead art)", () => {
    const arts = allArt();
    expect(arts.length).toBeGreaterThanOrEqual(20);
    for (const a of arts) {
      expect(a.path.startsWith("/assets/"), a.where).toBe(true);
      expect(existsSync(join(__dirname, "..", "public", a.path)), `${a.where} → ${a.path}`).toBe(true);
    }
  });

  it("the habitat-setup essentials all carry photo tiles (the reference look)", () => {
    for (const card of careTabById("habitat").sections[0].cards!) expect(card.art, card.title).toBeTruthy();
  });
});

describe("readable, human copy", () => {
  it("every learn-more note is a complete sentence, long enough to teach", () => {
    for (const tab of CARE_GUIDE_TABS)
      for (const sect of tab.sections)
        for (const card of sect.cards ?? [])
          for (const line of card.more) {
            expect(line.length, `${tab.id}/${card.title}`).toBeGreaterThan(40);
            expect(/[.!]$/.test(line.trim()), `${tab.id}/${card.title}: "${line}"`).toBe(true);
          }
  });

  it("carries rotating field notes (the quiz CTA is gone for good)", () => {
    expect(CARE_FACTS.length).toBeGreaterThanOrEqual(6);
    for (const f of CARE_FACTS) {
      expect(f.length).toBeGreaterThan(40);
      expect(/[.!]$/.test(f.trim())).toBe(true);
    }
  });

  it("feeding keeps the prey-size rule of thumb", () => {
    const tab = careTabById("feeding");
    const facts = tab.quickRef.groups.flatMap((g) => g.facts ?? []);
    expect(facts.some((f) => f.label === "Prey size")).toBe(true);
    expect(tab.hero.body).toContain("space between");
  });
});
