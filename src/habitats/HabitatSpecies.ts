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
    baskingC: [28, 32],
    coolC: [22, 25],
    humidity: [30, 45],
    minHides: 2,
    needsBasking: true,
    // No adhesive toe pads — a leopard gecko cannot climb glass. The tank
    // walls are ALWAYS walls for this species, whatever its personality.
    canClimbGlass: false,
  },
  compatibleSpecies: ["isopods"],
  incompatibleSpecies: ["crested_gecko", "tarantula"],
  stressTriggers: ["cohabiting_males", "low_temperature", "high_humidity", "too_few_hides", "small_enclosure"],
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
