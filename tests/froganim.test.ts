/** Frog animation map — behavior-state ↔ clip contract (pure layer). */
import { describe, expect, it } from "vitest";
import {
  FROG_ANIMATION_MAP,
  FROG_BEHAVIOR_STATES,
  FROG_CLIP_EVENTS,
  FROG_PROCEDURAL_SPECS,
  FROG_RIG_SUPPORT,
  frogAnimationReport,
  resolveFrogAnimations,
} from "../src/data/creatures/frogAnimationMap";
import { getCreature } from "../src/data/creatures/creatureRegistry";

const SHIPPED_GLB_CLIPS = ["Animation"]; // what the real asset ships today
const PROC_NAMES = FROG_PROCEDURAL_SPECS.map((s) => s.name);

describe("frog behavior-state map", () => {
  it("covers the full designed state list (35 states)", () => {
    expect(FROG_BEHAVIOR_STATES).toHaveLength(35);
    for (const key of [
      "idle_breathing",
      "blink",
      "tongue_catch",
      "water_float",
      "startled_jump",
      "collapsed_faint",
      "poop",
    ]) {
      expect(FROG_BEHAVIOR_STATES).toContain(key);
    }
  });

  it("has honest copy + preferred names on every state", () => {
    for (const state of FROG_BEHAVIOR_STATES) {
      const m = FROG_ANIMATION_MAP[state];
      expect(m.preferred.length).toBeGreaterThan(0);
      expect(m.note.length).toBeGreaterThan(15);
    }
  });

  it("every fallback is a real procedural spec; specs follow the naming rule", () => {
    const names = new Set(PROC_NAMES);
    expect(names.size).toBe(FROG_PROCEDURAL_SPECS.length); // unique
    for (const s of FROG_PROCEDURAL_SPECS) {
      expect(s.name.startsWith("procedural_frog_")).toBe(true);
      expect(s.duration).toBeGreaterThan(0);
      expect(s.about.length).toBeGreaterThan(20);
    }
    for (const state of FROG_BEHAVIOR_STATES) {
      const fb = FROG_ANIMATION_MAP[state].fallback;
      if (fb !== null) expect(names.has(fb)).toBe(true);
    }
  });

  it("never fakes rig-impossible motion: blink / tongue / jaw / climbs have NO fallback", () => {
    for (const state of [
      "blink",
      "tongue_catch",
      "bite",
      "chew_swallow",
      "missed_tongue",
      "climb_up",
      "climb_down",
      "climb_out_water",
      "slow_crawl",
      "big_jump",
      "landing",
    ] as const) {
      expect(FROG_ANIMATION_MAP[state].fallback).toBeNull();
    }
  });

  it("resolves GLB-first, procedural second, missing loudly", () => {
    const resolved = resolveFrogAnimations(SHIPPED_GLB_CLIPS, PROC_NAMES);
    const byState = new Map(resolved.map((r) => [r.state, r]));
    // The baked idle wins over the procedural twin.
    expect(byState.get("idle_breathing")).toMatchObject({ source: "glb", clip: "Animation" });
    // Fallback-covered states resolve procedural.
    expect(byState.get("small_hop")).toMatchObject({ source: "procedural", clip: "procedural_frog_small_hop" });
    expect(byState.get("sleep")).toMatchObject({ source: "procedural", clip: "procedural_frog_sleep_pose" });
    // Impossible states stay missing (never silently hidden).
    expect(byState.get("blink")).toMatchObject({ source: "missing", clip: null });
    expect(byState.get("tongue_catch")).toMatchObject({ source: "missing", clip: null });
    // With a future Fiverr clip present, the real clip takes over.
    const upgraded = resolveFrogAnimations([...SHIPPED_GLB_CLIPS, "frog_tongue_catch"], PROC_NAMES);
    expect(upgraded.find((r) => r.state === "tongue_catch")).toMatchObject({ source: "glb", clip: "frog_tongue_catch" });
  });

  it("today's shipped asset yields 1 glb / 23 procedural / 11 missing", () => {
    const resolved = resolveFrogAnimations(SHIPPED_GLB_CLIPS, PROC_NAMES);
    const count = (s: string): number => resolved.filter((r) => r.source === s).length;
    expect(count("glb")).toBe(1);
    expect(count("procedural")).toBe(23);
    expect(count("missing")).toBe(11);
  });

  it("exposes the poop waste-spawn event marker inside the clip's duration", () => {
    const ev = FROG_CLIP_EVENTS.procedural_frog_poop_trigger;
    const specDur = FROG_PROCEDURAL_SPECS.find((s) => s.name === "procedural_frog_poop_trigger")!.duration;
    expect(ev.wasteSpawnAt).toBeGreaterThan(0);
    expect(ev.wasteSpawnAt).toBeLessThan(specDur);
  });

  it("agrees with the creature registry (idle alias) and states its rig limits", () => {
    const frog = getCreature("colorful_frog");
    const idleClip = frog.asset.rig?.clips.idle;
    expect(idleClip).toBeTruthy();
    expect(FROG_ANIMATION_MAP.idle_breathing.preferred).toContain(idleClip);
    expect(FROG_RIG_SUPPORT.join(" ")).toMatch(/no eyelid/i);
    expect(FROG_RIG_SUPPORT.join(" ")).toMatch(/jaw \/ tongue|no jaw/i);
  });

  it("writes a report that surfaces missing states with the Fiverr callout", () => {
    const report = frogAnimationReport(SHIPPED_GLB_CLIPS, PROC_NAMES);
    expect(report).toContain("Missing — needs Fiverr animation (11)");
    expect(report).toContain("tongue_catch [REQUIRED FOR RELEASE]");
    expect(report).toContain('idle_breathing → "Animation"');
    expect(report).toContain("Rig support:");
  });
});
