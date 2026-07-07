/**
 * Swim profiles — per-behavior motion + body-animation tuning, kept as data so
 * the feel of each kind of creature can be adjusted in one place.
 *
 * Amplitudes are fractions of the fish's on-screen height; frequencies are in
 * rad/s; `cruise` comes from the species' own `speed` so the data stays the
 * single source of truth.
 */
import type { Species } from "./species";

export interface SwimProfile {
  /** Base cruise speed (interior widths / sec). */
  cruise: number;
  /** Steering responsiveness — how quickly velocity turns toward intent. */
  turn: number;
  /** Cruise tail amplitude, as a fraction of fish height. */
  tailAmp: number;
  /** Base tail-beat frequency (rad/s) at a normal cruise. */
  tailFreq: number;
  /** Body wave span across head→tail (radians) — a gentle C/S curve. */
  bodyFlex: number;
  /** 0..1 tendency to pause and hover in place. */
  hover: number;
  /** Per-second probability of a spontaneous dart. */
  dartChance: number;
  /** 0..1 cohesion toward the shoal centre. */
  schooling: number;
  /** Preferred depth band (z: 0 back wall → 1 front glass). */
  depth: [number, number];
}

const BY_BEHAVIOR: Record<string, Omit<SwimProfile, "cruise">> = {
  // Small schooling fish: quick, tight, busy tails, mid/back water.
  school: { turn: 2.6, tailAmp: 0.17, tailFreq: 7.5, bodyFlex: 2.7, hover: 0.1, dartChance: 0.06, schooling: 1.0, depth: [0.2, 0.82] },
  mid: { turn: 2.1, tailAmp: 0.16, tailFreq: 6.6, bodyFlex: 2.5, hover: 0.18, dartChance: 0.06, schooling: 0.5, depth: [0.25, 0.85] },
  // Centerpiece: slow, graceful, big slow body wave, mid/front water.
  centerpiece: { turn: 1.25, tailAmp: 0.2, tailFreq: 3.6, bodyFlex: 1.9, hover: 0.4, dartChance: 0.02, schooling: 0.0, depth: [0.45, 0.9] },
  // Bottom dweller: short scoots, frequent pauses, subtle tail, near substrate.
  bottom: { turn: 1.8, tailAmp: 0.09, tailFreq: 5.0, bodyFlex: 2.2, hover: 0.55, dartChance: 0.06, schooling: 0.0, depth: [0.45, 0.97] },
  // Grazers (shrimp/snail) don't get fish-style body flex (handled separately).
  grazer: { turn: 1.0, tailAmp: 0.0, tailFreq: 0.0, bodyFlex: 0.0, hover: 0.7, dartChance: 0.0, schooling: 0.0, depth: [0.55, 0.98] },
};

export function swimProfile(s: Species): SwimProfile {
  const base = BY_BEHAVIOR[s.behavior] ?? BY_BEHAVIOR.mid;
  return { ...base, cruise: s.speed };
}
