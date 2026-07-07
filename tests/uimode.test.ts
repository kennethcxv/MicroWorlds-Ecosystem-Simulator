/**
 * UI MODE SYSTEM — the pure state machine behind the GLASSWATER gecko HUD
 * (reference-match pass). One active mode at a time; each mode declares which
 * UI regions are visible (stat strip / action dock / bottom drawer / animal
 * panel / top cards); Esc always returns to gecko-main; re-requesting the
 * active mode toggles back to gecko-main.
 */
import { describe, expect, it } from "vitest";
import { GwModeMachine, regionsFor, type GwMode } from "../src/ui/gwModes";

describe("regionsFor — which UI regions each mode shows", () => {
  it("gecko-main shows the stat strip + large action dock, no drawer", () => {
    const r = regionsFor("gecko-main");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.slimNav).toBe(false);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(false);
    expect(r.topCards).toBe("full");
    expect(r.cameraFree).toBe(false);
  });

  it("clean hides the stat strip + dock and shows its drawer + slim nav", () => {
    const r = regionsFor("clean");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(true);
    expect(r.drawer).toBe("clean");
    expect(r.animalPanel).toBe(false);
  });

  it("terrain runs flush to the bottom edge — its tabs + ✕ carry the mode, NO slim nav", () => {
    const r = regionsFor("terrain");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(false);
    expect(r.drawer).toBe("terrain");
    expect(r.animalPanel).toBe(false);
  });

  it("feed is the reference drawer ALONE — method rail + ✕ inside it, no slim nav", () => {
    const r = regionsFor("feed");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(false);
    expect(r.drawer).toBe("feed");
    expect(r.animalPanel).toBe(false);
    expect(r.topCards).toBe("full");
  });

  it("decorate shows the decorate tray with the free camera", () => {
    const r = regionsFor("decorate");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.drawer).toBe("decorate");
    expect(r.cameraFree).toBe(true);
  });

  it("animal-info keeps the main HUD and adds the right panel", () => {
    const r = regionsFor("animal-info");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(true);
  });

  it("photo hides almost everything and keeps compact top cards + free camera", () => {
    const r = regionsFor("photo");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(false);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(false);
    expect(r.topCards).toBe("compact");
    expect(r.cameraFree).toBe(true);
  });

  it("cinematic is FULL SCREEN: every region hidden, letterbox on, cinematic camera", () => {
    const r = regionsFor("cinematic");
    expect(r.statStrip).toBe(false);
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(false);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(false);
    expect(r.topCards).toBe("hidden");
    expect(r.cameraFree).toBe(false);
    expect(r.letterbox).toBe(true);
    expect(r.cameraCinematic).toBe(true);
  });

  it("no other mode letterboxes or uses the cinematic camera", () => {
    for (const mode of ["gecko-main", "feed", "clean", "terrain", "decorate", "animal-info", "photo"] as GwMode[]) {
      const r = regionsFor(mode);
      expect(r.letterbox, mode).toBe(false);
      expect(r.cameraCinematic, mode).toBe(false);
    }
  });
});

describe("GwModeMachine — transitions", () => {
  it("starts in gecko-main", () => {
    expect(new GwModeMachine().mode).toBe("gecko-main");
  });

  it("request(mode) enters that mode", () => {
    const m = new GwModeMachine();
    m.request("feed");
    expect(m.mode).toBe("feed");
  });

  it("switching between drawer modes never leaves two open (single active mode)", () => {
    const m = new GwModeMachine();
    m.request("feed");
    m.request("terrain");
    expect(m.mode).toBe("terrain");
    expect(regionsFor(m.mode).drawer).toBe("terrain");
  });

  it("re-requesting the active mode toggles back to gecko-main", () => {
    const m = new GwModeMachine();
    m.request("clean");
    m.request("clean");
    expect(m.mode).toBe("gecko-main");
  });

  it("escape() always returns to gecko-main", () => {
    const m = new GwModeMachine();
    for (const mode of ["feed", "decorate", "animal-info", "photo", "cinematic"] as GwMode[]) {
      m.request(mode);
      m.escape();
      expect(m.mode).toBe("gecko-main");
    }
  });

  it("escape() in gecko-main stays in gecko-main", () => {
    const m = new GwModeMachine();
    m.escape();
    expect(m.mode).toBe("gecko-main");
  });

  it("notifies subscribers exactly once per actual change, with prev + next", () => {
    const m = new GwModeMachine();
    const seen: [GwMode, GwMode][] = [];
    m.onChange((next, prev) => seen.push([next, prev]));
    m.request("feed"); // main → feed
    m.request("feed"); // feed → main (toggle)
    m.escape(); // no-op: already main
    expect(seen).toEqual([
      ["feed", "gecko-main"],
      ["gecko-main", "feed"],
    ]);
  });

  it("request returns the mode actually entered (for toggle callers)", () => {
    const m = new GwModeMachine();
    expect(m.request("terrain")).toBe("terrain");
    expect(m.request("terrain")).toBe("gecko-main");
  });
});

describe("Fish habitat modes — a second machine with home = fish-main", () => {
  it("fish-main shows the stat strip + dock (the aquarium's rest state)", () => {
    const r = regionsFor("fish-main");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(false);
  });

  it("fish-feed / fish-clean open their own drawers, no slim nav", () => {
    const feed = regionsFor("fish-feed");
    expect(feed.drawer).toBe("fish-feed");
    expect(feed.dock).toBe(false);
    expect(feed.slimNav).toBe(false);
    const clean = regionsFor("fish-clean");
    expect(clean.drawer).toBe("fish-clean");
    expect(clean.dock).toBe(false);
  });

  it("fish-info keeps the main HUD and adds the residents panel", () => {
    const r = regionsFor("fish-info");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.animalPanel).toBe(true);
  });

  it("a fish machine rests, toggles and escapes to fish-main (never gecko-main)", () => {
    const m = new GwModeMachine("fish-main");
    expect(m.mode).toBe("fish-main");
    m.request("fish-feed");
    expect(m.mode).toBe("fish-feed");
    m.request("fish-feed"); // toggle
    expect(m.mode).toBe("fish-main");
    m.request("photo");
    m.escape();
    expect(m.mode).toBe("fish-main");
  });

  it("the gecko machine's home is unchanged by the fish addition", () => {
    const m = new GwModeMachine();
    m.request("fish-feed"); // even a cross-habitat request escapes home correctly
    m.escape();
    expect(m.mode).toBe("gecko-main");
  });
});

describe("Frog habitat modes — a third machine with home = frog-main", () => {
  it("frog-main shows the stat strip + dock (the paludarium's rest state)", () => {
    const r = regionsFor("frog-main");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.drawer).toBeNull();
    expect(r.animalPanel).toBe(false);
    expect(r.topCards).toBe("full");
  });

  it("frog-feed opens its own drawer alone (no slim nav, no other drawers)", () => {
    const r = regionsFor("frog-feed");
    expect(r.drawer).toBe("frog-feed");
    expect(r.dock).toBe(false);
    expect(r.slimNav).toBe(false);
    expect(r.animalPanel).toBe(false);
  });

  it("frog-info keeps the main HUD and adds the animal panel", () => {
    const r = regionsFor("frog-info");
    expect(r.statStrip).toBe(true);
    expect(r.dock).toBe(true);
    expect(r.animalPanel).toBe(true);
  });

  it("a frog machine rests, toggles and escapes to frog-main (never another home)", () => {
    const m = new GwModeMachine("frog-main");
    expect(m.mode).toBe("frog-main");
    m.request("frog-feed");
    expect(m.mode).toBe("frog-feed");
    m.request("frog-feed"); // toggle
    expect(m.mode).toBe("frog-main");
    m.request("photo");
    m.escape();
    expect(m.mode).toBe("frog-main");
  });

  it("photo mode is shared: compact top cards + free camera for the frog too", () => {
    const m = new GwModeMachine("frog-main");
    m.request("photo");
    const r = regionsFor(m.mode as GwMode);
    expect(r.topCards).toBe("compact");
    expect(r.cameraFree).toBe(true);
  });
});
