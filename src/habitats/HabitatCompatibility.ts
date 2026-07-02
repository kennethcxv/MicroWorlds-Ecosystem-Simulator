/**
 * Species compatibility foundation — pure. Even with one gecko today, the data
 * model + rules exist so "can these share an enclosure?" is answerable and
 * extensible. Verdicts: safe · caution · danger · food (a feeder/prey relation).
 *
 * Examples the brief calls for:
 *   gecko + cricket   → food   (feeder, not a tankmate)
 *   gecko + male gecko→ caution (territorial)
 *   gecko + tarantula → danger (injury/predation risk)
 *   gecko + isopods   → safe   (cleanup crew)
 */
import type { CareProfile, CompatibilityResult, CompatibilityVerdict } from "./HabitatTypes";
import { careProfile } from "./HabitatSpecies";

function intersects(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

/** Does predator `p` eat prey `q`? (prey identity = its classTags + speciesId). */
function eats(p: CareProfile, q: CareProfile): boolean {
  return intersects(p.preyTags, [...q.classTags, q.speciesId]);
}

const isFeeder = (c: CareProfile): boolean => c.classTags.includes("feeder");
const sharedHabitat = (a: CareProfile, b: CareProfile): boolean =>
  intersects(a.habitatTags, b.habitatTags);

const SEVERITY: Record<CompatibilityVerdict, number> = { safe: 0, food: 1, caution: 2, danger: 3 };

export function checkCompatibility(aId: string, bId: string): CompatibilityResult {
  const a = careProfile(aId);
  const b = careProfile(bId);
  if (!a || !b) return { a: aId, b: bId, verdict: "caution", reason: "Unknown species — verify care needs." };

  const explicitBad = a.incompatibleSpecies.includes(bId) || b.incompatibleSpecies.includes(aId);
  const aEatsB = eats(a, b);
  const bEatsA = eats(b, a);
  const dangerousPredation = (aEatsB && !isFeeder(b)) || (bEatsA && !isFeeder(a));

  if (dangerousPredation) {
    const predator = aEatsB && !isFeeder(b) ? a : b;
    const prey = predator === a ? b : a;
    return { a: aId, b: bId, verdict: "danger", reason: `${predator.commonName} can injure or eat ${prey.commonName}.` };
  }
  if (explicitBad) {
    return { a: aId, b: bId, verdict: "danger", reason: `${a.commonName} and ${b.commonName} must not be housed together.` };
  }
  if ((aEatsB && isFeeder(b)) || (bEatsA && isFeeder(a))) {
    const predator = aEatsB ? a : b;
    const prey = predator === a ? b : a;
    return { a: aId, b: bId, verdict: "food", reason: `${prey.commonName} is food for ${predator.commonName}, not a tankmate.` };
  }
  if (aId === bId && (a.temperament === "territorial" || a.temperament === "aggressive")) {
    return { a: aId, b: bId, verdict: "caution", reason: `Two ${a.commonName}s may fight — territorial. House separately or give large, same-sex-safe space.` };
  }
  if (!sharedHabitat(a, b)) {
    return { a: aId, b: bId, verdict: "caution", reason: `Different climates: ${a.habitatTags.join("/")} vs ${b.habitatTags.join("/")}.` };
  }
  if (a.compatibleSpecies.includes(bId) || b.compatibleSpecies.includes(aId)) {
    return { a: aId, b: bId, verdict: "safe", reason: `${a.commonName} and ${b.commonName} coexist well.` };
  }
  return { a: aId, b: bId, verdict: "safe", reason: "No known conflicts." };
}

/** All pairwise verdicts worse than "safe" for a set of species (for warnings). */
export function groupWarnings(speciesIds: string[]): CompatibilityResult[] {
  const out: CompatibilityResult[] = [];
  for (let i = 0; i < speciesIds.length; i++) {
    for (let j = i + 1; j < speciesIds.length; j++) {
      const r = checkCompatibility(speciesIds[i], speciesIds[j]);
      if (r.verdict !== "safe") out.push(r);
    }
  }
  return out.sort((x, y) => SEVERITY[y.verdict] - SEVERITY[x.verdict]);
}

/** Worst-case verdict for introducing `newId` to the animals already present. */
export function verdictForAdding(existingIds: string[], newId: string): CompatibilityResult {
  let worst: CompatibilityResult = { a: newId, b: newId, verdict: "safe", reason: "No known conflicts." };
  for (const id of existingIds) {
    const r = checkCompatibility(id, newId);
    if (SEVERITY[r.verdict] > SEVERITY[worst.verdict]) worst = r;
  }
  return worst;
}
