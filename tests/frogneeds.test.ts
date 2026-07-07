import { describe, expect, it } from "vitest";
import {
  FROG_NEEDS,
  currentHumidity,
  decayMist,
  feedFrog,
  frogComfort,
  frogStressTarget,
  sprayMist,
  updateFrogNeeds,
  type HumidityModel,
} from "../src/habitats/frog/FrogNeedsSystem";
import { makeColorfulFrog, insidePond, FROG_POND, paintFrogFloor } from "../src/habitats/frog/FrogHabitatData";
import { ensureMaterialMap, coverageFractions } from "../src/habitats/HabitatMaterialMap";
import { FROG_DIMENSIONS } from "../src/habitats/frog/FrogHabitatData";
import type { HabitatEnvironment } from "../src/habitats/HabitatTypes";

const humidEnv = (): HabitatEnvironment => ({ baskingC: 27, coolC: 23, humidity: 82, cleanliness: 90 });
const dryEnv = (): HabitatEnvironment => ({ baskingC: 27, coolC: 23, humidity: 34, cleanliness: 90 });

describe("frog needs", () => {
  it("hydration rises in comfortably humid air and falls (session-paced) in dry air", () => {
    const wet = makeColorfulFrog();
    wet.needs.hydration = 60;
    updateFrogNeeds(wet, humidEnv(), { inPond: false }, 10);
    expect(wet.needs.hydration!).toBeGreaterThan(60);

    const dry = makeColorfulFrog();
    dry.needs.hydration = 60;
    // Two dry minutes cost a few points — pressure over a session, not seconds.
    updateFrogNeeds(dry, dryEnv(), { inPond: false }, 120);
    expect(dry.needs.hydration!).toBeLessThan(55);
    expect(dry.needs.hydration!).toBeGreaterThan(40);
  });

  it("a pond soak restores hydration much faster than humid air", () => {
    const soak = makeColorfulFrog();
    soak.needs.hydration = 30;
    updateFrogNeeds(soak, dryEnv(), { inPond: true }, 8);
    expect(soak.needs.hydration!).toBeGreaterThan(55);
  });

  it("deep dehydration erodes health; good conditions heal", () => {
    const parched = makeColorfulFrog();
    parched.needs.hydration = 5;
    parched.needs.health = 80;
    updateFrogNeeds(parched, dryEnv(), { inPond: false }, 60);
    expect(parched.needs.health).toBeLessThan(80);

    const happy = makeColorfulFrog();
    happy.needs.health = 80;
    updateFrogNeeds(happy, humidEnv(), { inPond: false }, 60);
    expect(happy.needs.health).toBeGreaterThan(80);
  });

  it("dry air raises the stress target far more than mild warmth", () => {
    const frog = makeColorfulFrog();
    const dryTarget = frogStressTarget(dryEnv(), frog);
    const humidTarget = frogStressTarget(humidEnv(), frog);
    expect(dryTarget).toBeGreaterThan(humidTarget + 20);
  });

  it("a startle spikes stress, then it eases back down in good conditions", () => {
    const frog = makeColorfulFrog();
    frog.needs.stress = 10;
    updateFrogNeeds(frog, humidEnv(), { inPond: false, startled: true }, 1.5);
    const spiked = frog.needs.stress;
    expect(spiked).toBeGreaterThan(30);
    updateFrogNeeds(frog, humidEnv(), { inPond: false }, 120);
    expect(frog.needs.stress).toBeLessThan(spiked);
  });

  it("feeding restores hunger and calms slightly, capped at 100", () => {
    const frog = makeColorfulFrog();
    frog.needs.hunger = 40;
    frog.needs.stress = 30;
    feedFrog(frog);
    expect(frog.needs.hunger).toBe(40 + FROG_NEEDS.eatHungerRestore);
    expect(frog.needs.stress).toBe(27);
    frog.needs.hunger = 95;
    feedFrog(frog);
    expect(frog.needs.hunger).toBe(100);
  });

  it("hunger drains at the slow session pace", () => {
    const frog = makeColorfulFrog();
    frog.needs.hunger = 80;
    updateFrogNeeds(frog, humidEnv(), { inPond: false }, 60);
    expect(frog.needs.hunger).toBeCloseTo(80 - 60 * FROG_NEEDS.hungerDrainPerSec, 4);
  });

  it("comfort reads high in the band and low when dry", () => {
    const frog = makeColorfulFrog();
    expect(frogComfort(humidEnv(), frog)).toBeGreaterThan(75);
    frog.needs.hydration = 25;
    expect(frogComfort(dryEnv(), frog)).toBeLessThan(55);
  });
});

describe("humidity model", () => {
  it("misting jumps humidity toward wet, then decays back toward base", () => {
    const m: HumidityModel = { base: 52, mistBoost: 0 };
    const before = currentHumidity(m);
    sprayMist(m);
    const after = currentHumidity(m);
    expect(after).toBeGreaterThan(before + 25);
    for (let i = 0; i < 600; i++) decayMist(m, 1);
    expect(currentHumidity(m)).toBe(before);
  });

  it("repeat-spraying saturates below 98%", () => {
    const m: HumidityModel = { base: 60, mistBoost: 0 };
    for (let i = 0; i < 10; i++) sprayMist(m);
    expect(currentHumidity(m)).toBeLessThanOrEqual(97);
  });
});

describe("pond + floor data", () => {
  it("insidePond matches the authored ellipse", () => {
    expect(insidePond(FROG_POND.x, FROG_POND.z)).toBe(true);
    expect(insidePond(FROG_POND.x + FROG_POND.rx * 0.9, FROG_POND.z)).toBe(true);
    expect(insidePond(FROG_POND.x + FROG_POND.rx * 1.2, FROG_POND.z)).toBe(false);
    expect(insidePond(-0.8, -0.6)).toBe(false);
  });

  it("paintFrogFloor lays real moss / leaf-litter / bioactive coverage", () => {
    const map = ensureMaterialMap(undefined, "mossy_soil");
    paintFrogFloor(map, FROG_DIMENSIONS);
    const cover = coverageFractions(map);
    expect(cover.get("mossy_soil")!).toBeGreaterThan(0.4);
    expect(cover.get("leaf_litter")!).toBeGreaterThan(0.05);
    expect(cover.get("bioactive_soil")!).toBeGreaterThan(0.03);
  });
});
