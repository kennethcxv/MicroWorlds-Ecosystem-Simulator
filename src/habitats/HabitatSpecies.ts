/**
 * Care profiles for habitat animals + feeder species. Pure data. Drives the
 * needs system (ideal temperature/humidity/hides) and the compatibility checks
 * (diet/temperament/predator↔prey/compat lists). Only what the prototype needs
 * today — leopard gecko is the star; the rest exist so the compatibility + care
 * model is real and extensible when more animals arrive.
 */
import type { CareProfile } from "./HabitatTypes";

export const LEOPARD_GECKO: CareProfile = {
  speciesId: "leopard_gecko",
  commonName: "Leopard Gecko",
  scientificName: "Eublepharis macularius",
  diet: ["insectivore"],
  habitatTags: ["desert", "arid", "terrestrial"],
  sizeCm: 20,
  temperament: "territorial", // docile to keepers, but males fight — intraspecies risk
  classTags: ["gecko", "lizard", "small_lizard"],
  preyTags: ["cricket", "mealworm", "dubia_roach", "insect"],
  predatorTags: ["snake", "large_lizard", "bird_of_prey"],
  ideal: {
    // Researched bands (ReptiFiles/Zen Habitats 2026): basking ZONE 30–34°C
    // (surface under the lamp runs 34–36°C), cool side 21–25°C, ambient
    // humidity 30–40% with a 70–80% humid hide microclimate.
    baskingC: [30, 34],
    coolC: [21, 25],
    humidity: [30, 40],
    minHides: 2,
    needsBasking: true,
    // No adhesive toe pads — a leopard gecko cannot climb glass. The tank
    // walls are ALWAYS walls for this species, whatever its personality.
    canClimbGlass: false,
  },
  compatibleSpecies: ["isopods"],
  incompatibleSpecies: ["crested_gecko", "tarantula"],
  stressTriggers: ["cohabiting_males", "low_temperature", "high_humidity", "too_few_hides", "small_enclosure"],
  // ── Researched biology (docs/production/ANIMAL_BIOLOGY_RESEARCH.md) ──
  sociality: "solitary",
  socialNote:
    "Leopard geckos are happily solitary — they don't get lonely, and a tankmate is a stressor, not company. Never house two males together.",
  activityPattern: "Crepuscular — most active at dawn and dusk",
  swim: "none",
  swimNote: "Cannot swim — offer water only as a shallow dish it can stand in. Deep water is unsafe for this species.",
  sexable: true, // hemipenal bulges + pre-anal pores from ~6 months
  dietNote: "Insectivore — gut-loaded crickets, roaches and worms; waxworms are treats only",
  careTips: [
    "Dust most feedings with calcium; add D3 or run low UVB.",
    "Keep one humid hide (~75% inside) — it makes shedding easy.",
    "It toilets in ONE corner — scoop that spot and cleaning stays quick.",
    "A thick tail is a healthy tail: that's its fat reserve.",
  ],
};

export const CRESTED_GECKO: CareProfile = {
  speciesId: "crested_gecko",
  commonName: "Crested Gecko",
  scientificName: "Correlophus ciliatus",
  diet: ["omnivore"],
  habitatTags: ["tropical", "arboreal"],
  sizeCm: 18,
  temperament: "shy",
  classTags: ["gecko", "lizard", "small_lizard"],
  preyTags: ["cricket", "dubia_roach", "insect"],
  predatorTags: ["snake", "large_lizard", "bird_of_prey"],
  ideal: {
    baskingC: [22, 26],
    coolC: [20, 24],
    humidity: [60, 80],
    minHides: 2,
    needsBasking: false,
    // Toe pads! Cresties CAN stick to glass (wall-climbing lands with an
    // arboreal habitat build — the flag is the species-data gate for it).
    canClimbGlass: true,
  },
  compatibleSpecies: ["isopods"],
  incompatibleSpecies: ["leopard_gecko", "tarantula"], // climate mismatch + risk
  stressTriggers: ["low_humidity", "high_temperature", "too_few_hides"],
};

export const CRICKET: CareProfile = {
  speciesId: "cricket",
  commonName: "House Cricket",
  scientificName: "Acheta domesticus",
  diet: ["herbivore"],
  habitatTags: ["terrestrial"],
  sizeCm: 2,
  temperament: "skittish",
  classTags: ["insect", "feeder"],
  preyTags: [],
  predatorTags: ["gecko", "lizard", "small_lizard", "arachnid", "insectivore"],
  ideal: { baskingC: [22, 32], coolC: [18, 28], humidity: [30, 70], minHides: 0, needsBasking: false },
  compatibleSpecies: [],
  incompatibleSpecies: [],
  stressTriggers: [],
};

export const ISOPODS: CareProfile = {
  speciesId: "isopods",
  commonName: "Isopods (cleanup crew)",
  scientificName: "Porcellio / Armadillidium",
  diet: ["omnivore"],
  habitatTags: ["terrestrial"],
  sizeCm: 1,
  temperament: "docile",
  classTags: ["invertebrate", "cleanup_crew"],
  preyTags: ["detritus"],
  predatorTags: [],
  ideal: { baskingC: [20, 30], coolC: [18, 26], humidity: [40, 80], minHides: 0, needsBasking: false },
  compatibleSpecies: ["leopard_gecko", "crested_gecko"],
  incompatibleSpecies: [],
  stressTriggers: [],
};

export const TARANTULA: CareProfile = {
  speciesId: "tarantula",
  commonName: "Tarantula",
  scientificName: "Theraphosidae",
  diet: ["carnivore"],
  habitatTags: ["terrestrial", "arid"],
  sizeCm: 14,
  temperament: "aggressive",
  classTags: ["arachnid", "spider"],
  preyTags: ["cricket", "mealworm", "insect", "small_lizard"],
  predatorTags: [],
  ideal: { baskingC: [24, 28], coolC: [22, 26], humidity: [50, 70], minHides: 1, needsBasking: false },
  compatibleSpecies: [],
  incompatibleSpecies: ["leopard_gecko", "crested_gecko"],
  stressTriggers: ["cohabitation"],
};

export const CARE_PROFILES: Record<string, CareProfile> = {
  leopard_gecko: LEOPARD_GECKO,
  crested_gecko: CRESTED_GECKO,
  cricket: CRICKET,
  isopods: ISOPODS,
  tarantula: TARANTULA,
};

export function careProfile(speciesId: string): CareProfile | undefined {
  return CARE_PROFILES[speciesId];
}

/** "leopard_gecko" → "Leopard Gecko" (info-panel compatibility pills). */
export function speciesDisplayName(speciesId: string): string {
  const p = CARE_PROFILES[speciesId];
  if (p) return p.commonName;
  return speciesId
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
