/**
 * HABITAT FILTERS REGISTRY — the data behind the Terrain editor's Filters tab
 * (reference: Designs/Gecko "Filters" image). Seven analysis filters, each
 * driving: the left list row (icon + tint), the main content (title,
 * description, recommendation), the ABOUT panel + TIPS card, and the habitat
 * overlay's colour scale + legend. Live scores come from the scene; the
 * status-word mapping is pure and tested here.
 */
import { describe, expect, it } from "vitest";
import {
  HABITAT_FILTERS,
  filterById,
  filterStatus,
  scaleColor,
} from "../src/data/habitatFilters";

const HEX = /^#[0-9a-f]{6}$/i;

describe("habitat filters registry", () => {
  it("ships ten lenses: the reference seven + Cleanliness, Comfort, Enrichment", () => {
    expect(HABITAT_FILTERS.map((f) => f.id)).toEqual([
      "heat",
      "humidity",
      "hide_coverage",
      "cleanliness",
      "comfort",
      "enrichment",
      "clutter",
      "dig_zones",
      "traffic_flow",
      "lighting",
    ]);
  });

  it("every filter is complete: name, SHORT label, icon, tint, copy, recommendation, tips", () => {
    for (const f of HABITAT_FILTERS) {
      expect(f.name.length, f.id).toBeGreaterThan(2);
      expect(f.short.length, f.id).toBeGreaterThan(2);
      expect(f.short.length, f.id).toBeLessThanOrEqual(10);
      expect(f.icon.length, f.id).toBeGreaterThan(1);
      expect(f.tint, f.id).toMatch(HEX);
      expect(f.description.length, f.id).toBeGreaterThan(18);
      expect(f.about.length, f.id).toBe(2);
      for (const p of f.about) expect(p.length, f.id).toBeGreaterThan(20);
      expect(f.tips.length, f.id).toBeGreaterThan(20);
      expect(f.recommendation.startsWith("Recommended:"), f.id).toBe(true);
      expect(f.legend.low.length, f.id).toBeGreaterThan(1);
      expect(f.legend.high.length, f.id).toBeGreaterThan(1);
    }
  });

  it("hide coverage matches the reference copy anchors", () => {
    const f = filterById("hide_coverage")!;
    expect(f.name).toBe("Hide Coverage");
    expect(f.recommendation).toBe("Recommended: 70%+");
  });

  it("colour scales are ascending 0→1 stops of valid hex colours", () => {
    for (const f of HABITAT_FILTERS) {
      expect(f.scale.length, f.id).toBeGreaterThanOrEqual(2);
      expect(f.scale[0].t, f.id).toBe(0);
      expect(f.scale[f.scale.length - 1].t, f.id).toBe(1);
      for (let i = 0; i < f.scale.length; i++) {
        expect(f.scale[i].color, `${f.id}[${i}]`).toMatch(HEX);
        if (i > 0) expect(f.scale[i].t, f.id).toBeGreaterThan(f.scale[i - 1].t);
      }
    }
  });

  it("filterById returns null for unknown ids", () => {
    expect(filterById("smell")).toBeNull();
  });
});

describe("filterStatus — score → status word + tone", () => {
  it("maps the reference score 72 to Good", () => {
    expect(filterStatus(72)).toEqual({ word: "Good", tone: "good" });
  });

  it("covers all bands with sensible boundaries", () => {
    expect(filterStatus(92).word).toBe("Excellent");
    expect(filterStatus(85).word).toBe("Excellent");
    expect(filterStatus(70).word).toBe("Good");
    expect(filterStatus(69).word).toBe("Fair");
    expect(filterStatus(50).word).toBe("Fair");
    expect(filterStatus(49).word).toBe("Needs Work");
    expect(filterStatus(50).tone).toBe("warn");
    expect(filterStatus(20).tone).toBe("bad");
  });
});

describe("scaleColor — colour ramp sampling", () => {
  it("returns the endpoint colours at t=0 and t=1 (clamped beyond)", () => {
    const f = filterById("hide_coverage")!;
    expect(scaleColor(f.scale, 0)).toBe(f.scale[0].color.toLowerCase());
    expect(scaleColor(f.scale, 1)).toBe(f.scale[f.scale.length - 1].color.toLowerCase());
    expect(scaleColor(f.scale, -0.4)).toBe(f.scale[0].color.toLowerCase());
    expect(scaleColor(f.scale, 1.7)).toBe(f.scale[f.scale.length - 1].color.toLowerCase());
  });

  it("interpolates between stops", () => {
    const mid = scaleColor(
      [
        { t: 0, color: "#000000" },
        { t: 1, color: "#ff0000" },
      ],
      0.5,
    );
    expect(mid).toBe("#800000");
  });
});
