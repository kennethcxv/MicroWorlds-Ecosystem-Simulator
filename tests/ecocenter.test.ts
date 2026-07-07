/** Eco-Center lodge (main menu) data contract. */
import { describe, expect, it } from "vitest";
import {
  ECO_SECTIONS,
  HABITAT_ROWS,
  HUB_FLAVOR,
  HUB_MOTTO,
  HUB_WELCOME,
  QUICK_NAV,
  RESTORATION,
  ecoSectionById,
  greetingFor,
  habitatRowCard,
  restorationPct,
} from "../src/data/ecoCenter";
import { HABITAT_CARDS } from "../src/data/habitats";

describe("eco-center sections", () => {
  it("has the seven labeled rooms from the design references", () => {
    expect(ECO_SECTIONS.map((s) => s.label)).toEqual([
      "Vivarium Wing",
      "Aquarium Wall",
      "Rainforest Room",
      "Restoration Wing",
      "Care Library",
      "Supply Corner",
      "Photo Wall",
    ]);
  });

  it("has unique ids and non-empty copy on every section", () => {
    const ids = ECO_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ECO_SECTIONS) {
      expect(s.subtitle.length).toBeGreaterThan(3);
      expect(s.desc.length).toBeGreaterThan(20);
      expect(s.desc.endsWith(".")).toBe(true);
    }
  });

  it("wires each player habitat to exactly one section", () => {
    const habitats = ECO_SECTIONS.filter((s) => s.action.kind === "habitat").map(
      (s) => (s.action as { kind: "habitat"; habitat: string }).habitat,
    );
    expect(habitats.sort()).toEqual(["fish", "frog", "lizard"]);
  });

  it("wires shop / guide / album screens and exactly one locked wing", () => {
    const screens = ECO_SECTIONS.filter((s) => s.action.kind === "screen").map(
      (s) => (s.action as { kind: "screen"; screen: string }).screen,
    );
    expect(screens.sort()).toEqual(["album", "guide", "shop"]);
    expect(ECO_SECTIONS.filter((s) => s.action.kind === "locked")).toHaveLength(1);
    expect(ecoSectionById("restoration-wing")?.action.kind).toBe("locked");
  });
});

describe("quick nav", () => {
  it("is the reference dock: Shop, Inventory, Guide, Album, Settings", () => {
    expect(QUICK_NAV.map((d) => d.id)).toEqual(["shop", "inventory", "guide", "album", "settings"]);
    for (const d of QUICK_NAV) {
      expect(d.label.length).toBeGreaterThan(3);
      expect(d.sub.length).toBeGreaterThan(3);
    }
  });
});

describe("current habitats rows", () => {
  it("covers the three player habitats and joins to real cards", () => {
    expect(HABITAT_ROWS.map((r) => r.id)).toEqual(["lizard", "fish", "frog"]);
    for (const r of HABITAT_ROWS) {
      const card = habitatRowCard(r.id);
      expect(card.id).toBe(r.id);
      expect(card.art.startsWith("/assets/")).toBe(true);
      expect(r.careLabel.length).toBeGreaterThan(3);
    }
    expect(HABITAT_ROWS).toHaveLength(HABITAT_CARDS.length);
  });
});

describe("restoration", () => {
  it("is honest: 3 of 4 bays living = 75%", () => {
    expect(RESTORATION.living).toBe(3);
    expect(RESTORATION.total).toBe(4);
    expect(restorationPct()).toBe(75);
  });

  it("clamps degenerate inputs", () => {
    expect(restorationPct(5, 4)).toBe(100);
    expect(restorationPct(-1, 4)).toBe(0);
    expect(restorationPct(1, 0)).toBe(0);
  });
});

describe("copy + greeting", () => {
  it("carries the reference welcome, flavor and motto lines", () => {
    expect(HUB_WELCOME).toBe("Welcome back, Keeper.");
    expect(HUB_FLAVOR).toMatch(/lasting ripple/);
    expect(HUB_MOTTO).toMatch(/Care\. Observe\./);
  });

  it("maps the in-game clock to day-part footer lines", () => {
    expect(greetingFor(3)).toBe("Night at the eco-center");
    expect(greetingFor(9)).toBe("Morning at the eco-center");
    expect(greetingFor(14)).toBe("Afternoon at the eco-center");
    expect(greetingFor(19.3)).toBe("Evening at the eco-center");
    expect(greetingFor(23)).toBe("Night at the eco-center");
    expect(greetingFor(27)).toBe("Night at the eco-center"); // wraps
  });
});
