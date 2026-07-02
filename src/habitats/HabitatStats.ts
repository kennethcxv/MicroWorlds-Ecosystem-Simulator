/**
 * Habitat quality scoring — pure. Sums each placed object's + equipment's
 * `affectsStats` contributions, caps each dimension at 0..100, and produces a
 * weighted overall habitat score (the number the HUD shows, mirroring the
 * reference UI's "Habitat Score 91 / Excellent").
 */
import type { HabitatLayout, HabitatScoreInputs, HabitatScores } from "./HabitatTypes";

function zeroInputs(): HabitatScoreInputs {
  return { hidingSpots: 0, basking: 0, climbing: 0, enrichment: 0, humidity: 0 };
}

/** Raw (uncapped) sum of every stat contribution in the layout. */
export function sumStatInputs(layout: HabitatLayout): HabitatScoreInputs {
  const acc = zeroInputs();
  const add = (s?: Partial<HabitatScoreInputs>): void => {
    if (!s) return;
    acc.hidingSpots += s.hidingSpots ?? 0;
    acc.basking += s.basking ?? 0;
    acc.climbing += s.climbing ?? 0;
    acc.enrichment += s.enrichment ?? 0;
    acc.humidity += s.humidity ?? 0;
  };
  for (const o of layout.objects) add(o.affectsStats);
  for (const e of layout.equipment) add(e.affectsStats);
  // Enrichment also rewards sheer variety of placed items.
  acc.enrichment += layout.objects.length * 3;
  return acc;
}

const cap = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));

// Leopard geckos are terrestrial + crepuscular: hides + a good basking gradient
// matter most; climbing least.
const WEIGHTS = { hidingSpots: 0.3, basking: 0.26, climbing: 0.12, enrichment: 0.16, humidity: 0.16 };

export function computeScores(layout: HabitatLayout): HabitatScores {
  const s = sumStatInputs(layout);
  const hidingSpots = cap(s.hidingSpots);
  const basking = cap(s.basking);
  const climbing = cap(s.climbing);
  const enrichment = cap(s.enrichment);
  const humidity = cap(s.humidity);
  const overall = cap(
    hidingSpots * WEIGHTS.hidingSpots +
      basking * WEIGHTS.basking +
      climbing * WEIGHTS.climbing +
      enrichment * WEIGHTS.enrichment +
      humidity * WEIGHTS.humidity,
  );
  return { hidingSpots, basking, climbing, enrichment, humidity, overall };
}

export type Rating = "Poor" | "Basic" | "Good" | "Excellent";

export function ratingFor(score: number): Rating {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 40) return "Basic";
  return "Poor";
}

/** Count of shelter objects — used by the needs system (min-hides rule). */
export function countHides(layout: HabitatLayout): number {
  return layout.objects.filter((o) => o.category === "hide").length;
}
