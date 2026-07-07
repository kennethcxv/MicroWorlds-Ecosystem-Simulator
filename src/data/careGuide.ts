/**
 * CARE GUIDE CONTENT — the data behind the Care Guide screen (reference:
 * Designs/Care_Guide/Screenshot 2026-07-03 at 11.33.51 PM.png).
 *
 * Pure data, no DOM: eight tabs (Overview / Feeding / Habitat Setup /
 * Heating & Lighting / Health / Behavior / Shedding / FAQ), each carrying a
 * hero, an info strip, card sections with expandable "Learn more" notes, a
 * right-hand Quick Reference and a checklist. The renderer lives in
 * src/ui/careGuide.ts.
 *
 * Two content rules:
 *  1. Husbandry numbers are NOT copied prose — temperatures/humidity derive
 *     from the researched LEOPARD_GECKO care profile (the same bands the
 *     in-game warnings and filter lenses use) and are stored as °C pairs; the
 *     renderer formats them through src/ui/prefs.ts so °F/°C applies. Feeder
 *     facts derive from the real FOOD_TYPES nutrition table.
 *  2. Every image is a REAL in-game capture: tab heroes and topic cards use
 *     screenshots taken inside the live vivarium / hub (public/assets/ui/
 *     care_guide/, regenerate with the capture script), habitat cards use the
 *     same render plates the Habitats page uses, and feeder cards use the
 *     Feed drawer's real food photos. Never stock art, never a mockup crop.
 *
 * Unit-tested in tests/careguide.test.ts.
 */
import type { GwIconName } from "../ui/gwIcons";
import { LEOPARD_GECKO } from "../habitats/HabitatSpecies";
import { FOOD_TYPES } from "../habitats/lizard/LizardNutrition";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CareTabId =
  | "overview"
  | "feeding"
  | "habitat"
  | "heat"
  | "health"
  | "behavior"
  | "shedding"
  | "faq";

/** A temperature band in °C — formatted at render time (°F by default). */
export interface CareTemp {
  tempC: [number, number];
}
export type CareValue = string | CareTemp;

export interface CareStripItem {
  icon: GwIconName;
  label: string;
  value: CareValue;
}

export interface CareCard {
  icon: GwIconName;
  /** Emoji tile instead of the SVG icon (fallback when no photo exists). */
  emoji?: string;
  /** Photo tile (public path) — wins over emoji/icon when present. */
  art?: string;
  title: string;
  body: string;
  /** Expandable "Learn more →" notes — full plain-language sentences. */
  more: string[];
}

export interface CareSection {
  title: string;
  sub?: string;
  cards?: CareCard[];
  /** Render the aquatic species encyclopedia grid in this section. */
  speciesGrid?: boolean;
}

export interface QuickFact {
  label: string;
  value: CareValue;
  tint?: "amber" | "blue" | "green";
}

export interface QuickGroup {
  icon: GwIconName;
  title: string;
  facts?: QuickFact[];
  /** Small arc dial (humidity style): band [lo,hi] on a [min,max] scale. */
  dial?: { lo: number; hi: number; min: number; max: number; unit: string; caption: string };
  note?: string;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface FaqEntry {
  q: string;
  a: string;
}

export interface CareTabDef {
  id: CareTabId;
  label: string;
  hero: {
    title: string;
    tagline: string;
    body: string;
    art?: string;
    artAlt?: string;
    /** Small chip over the photo — says where the capture came from. */
    caption?: string;
  };
  strip: CareStripItem[];
  sections: CareSection[];
  /** FAQ accordion entries (the FAQ tab renders these instead of card grids). */
  faq?: FaqEntry[];
  quickRef: { groups: QuickGroup[] };
  checklist?: { title: string; items: ChecklistItem[] };
}

/** Rotating "Did You Know?" sidebar notes — all true, all species-checked. */
export const CARE_FACTS: string[] = [
  "Leopard geckos store fat in their tails. A plump, carrot-shaped tail is the sign of a well-fed, healthy gecko.",
  "Unlike most geckos, leopard geckos have real eyelids — they blink, and they sleep with their eyes closed.",
  "Leopard geckos can't climb glass. They have tiny claws instead of sticky toe pads, which is why ground space matters more than height.",
  "A threatened leopard gecko can drop its tail to escape. It grows back, but never quite the same — so hands never grab a tail.",
  "Geckos usually eat their own shed skin. It recycles nutrients and, in the wild, hides their scent from predators.",
  "The white tip on a gecko dropping is urate — a desert animal's water-saving version of urine. Completely normal.",
  "Your red-eyed tree frog drinks through its skin. In Emerald Hollow, humid air and pond soaks are its water bowl.",
  "The aquarium runs real chemistry: waste becomes ammonia, filter bacteria turn it into nitrite and then nitrate — that's the nitrogen cycle on your meters.",
];

// ── Shared derived values ─────────────────────────────────────────────────────

const IDEAL = LEOPARD_GECKO.ideal;
const WARM: CareTemp = { tempC: [IDEAL.baskingC[0], IDEAL.baskingC[1]] };
const COOL: CareTemp = { tempC: [IDEAL.coolC[0], IDEAL.coolC[1]] };
/** Standard husbandry night drop (not modelled per-species yet). */
const NIGHT: CareTemp = { tempC: [20, 22] };
const HUMIDITY: [number, number] = [IDEAL.humidity[0], IDEAL.humidity[1]];

const ART = "/assets/ui/care_guide";
const HABITAT_ART = "/assets/ui/habitats";

const TEMPS_GROUP: QuickGroup = {
  icon: "thermo",
  title: "Recommended Temperatures",
  facts: [
    { label: "Warm Side", value: WARM, tint: "amber" },
    { label: "Cool Side", value: COOL, tint: "blue" },
    { label: "Night Drop", value: NIGHT, tint: "blue" },
  ],
};

const LIGHTING_GROUP: QuickGroup = {
  icon: "sun",
  title: "Lighting Notes",
  note:
    "Use a 12–14 hour day / 10–12 hour night cycle. UVB is optional for leopard geckos, but low levels can be beneficial.",
};

/** Real photos for the feeder cards — the same art the Feed drawer uses. */
const FEEDER_ART: Partial<Record<keyof typeof FOOD_TYPES, string>> = {
  cricket: "/assets/ui/food/crickets.png",
  mealworm: "/assets/ui/food/mealworms.png",
  superworm: "/assets/ui/food/superworms.png",
  dubia_roach: "/assets/ui/food/roaches.png",
  waxworm: "/assets/ui/food/treats.png",
};

// Feeder-insect cards straight from the real nutrition table.
const FEEDER_CARDS: CareCard[] = (Object.keys(FOOD_TYPES) as Array<keyof typeof FOOD_TYPES>).map((kind) => {
  const f = FOOD_TYPES[kind];
  const role =
    f.role === "staple"
      ? "This is a staple — it can make up most meals."
      : f.role === "occasional"
        ? "Serve this now and then for variety, not every feeding."
        : "This is a treat. Offer it rarely, and expect begging.";
  return {
    icon: "cricket" as GwIconName,
    emoji: f.icon,
    art: FEEDER_ART[kind],
    title: f.label,
    body: `${f.note}. ${role}`,
    more: [
      `Satiety ${f.satiety} · ${Math.round(f.fat * 100)}% fat · ${Math.round(f.moisture * 100)}% moisture. Juicier insects carry real water into the meal, which quietly supports hydration.`,
      f.role === "treat"
        ? "Fatty treats push body condition up fast. An overweight gecko is an unhealthy gecko, and many will start refusing normal food while holding out for treats."
        : "Feed the insects well for a day or two before serving them (keepers call this gut-loading). Your gecko eats whatever the insect ate.",
      "In the game, buy packs in the Supply Shop. The Feed drawer serves them straight from your stock, and dusting is one click in the same drawer.",
    ],
  };
});

// ── The eight tabs ────────────────────────────────────────────────────────────

const OVERVIEW: CareTabDef = {
  id: "overview",
  label: "Overview",
  hero: {
    title: "Welcome, Keeper",
    tagline: "Everything the eco-center knows about keeping tiny worlds alive.",
    body:
      "Three habitats are restored and running, and each one follows real husbandry — the same temperatures, humidity, feeding and cleaning rhythms real keepers use. Start with your animal's chapter, and keep the Quick Reference on the right within arm's reach.",
    art: `${ART}/overview_hero.jpg`,
    artAlt: "The eco-center display wall with three living habitats",
    caption: "Your display wall, photographed in the eco-center",
  },
  strip: [
    { icon: "gecko", label: "Vivarium", value: "Sunstone Desert" },
    { icon: "fish", label: "Aquarium", value: "Sapphire Stream" },
    { icon: "sprout", label: "Paludarium", value: "Emerald Hollow" },
    { icon: "book", label: "Chapters", value: "8 topics" },
  ],
  sections: [
    {
      title: "Your Habitats",
      sub: "What each little world needs from you.",
      cards: [
        {
          icon: "gecko",
          art: `${HABITAT_ART}/sunstone_desert.jpg`,
          title: "Sunstone Desert",
          body: "A desert vivarium for one leopard gecko — warm, dry, and full of hides.",
          more: [
            "Keep one end warm and the other end cool. The gecko moves between them to manage its own body temperature — the exact numbers live in the Heating & Lighting chapter.",
            "Leopard geckos live alone by nature. One gecko per vivarium isn't lonely, it's correct.",
            "They're most active at dawn and dusk. A gecko that hides through the bright hours is doing exactly what wild ones do.",
          ],
        },
        {
          icon: "fish",
          art: `${HABITAT_ART}/sapphire_stream.jpg`,
          title: "Sapphire Stream",
          body: "A planted freshwater community aquarium run by a real nitrogen cycle.",
          more: [
            "Feed small pinches. Anything the fish don't eat rots into ammonia and fouls the water.",
            "Water changes flush nitrate out of the system — watch the meters respond when you do one.",
            "Scrub the glass and vacuum the gravel now and then; cleanliness is as real here as chemistry.",
          ],
        },
        {
          icon: "sprout",
          art: `${HABITAT_ART}/emerald_hollow.jpg`,
          title: "Emerald Hollow",
          body: "A humid rainforest paludarium where a red-eyed tree frog hunts live crickets.",
          more: [
            "This tank wants 70–95% humidity. When the air reads too dry, one press of Mist fixes it.",
            "Frogs drink through their skin, so humid air and pond soaks are how this one stays hydrated.",
            "Release a few crickets and let the frog hunt. That's not chaos — it's exercise and enrichment.",
          ],
        },
      ],
    },
    {
      title: "Core Keeper Skills",
      sub: "The habits that keep every score green.",
      cards: [
        {
          icon: "bowl",
          title: "Feeding",
          body: "Right food, right portion, right schedule — stock up before you run out.",
          more: [
            "Every feeding consumes real supplies from your stock. The Supply Shop restocks them with leaves.",
            "Overfeeding is the most common beginner mistake in every habitat — smaller is almost always safer.",
            "The Feeding chapter covers insects, calcium dusting and fish food in plain terms.",
          ],
        },
        {
          icon: "broom",
          title: "Cleanliness",
          body: "Spot-clean little and often; grime stresses animals and fouls water.",
          more: [
            "Every cleaning action is a hands-on tool: a scoop for waste, a brush for sand, a squeegee for glass, a pour for fresh water.",
            "Your gecko toilets in one chosen corner — a real leopard-gecko habit that makes cleanup quick.",
            "Glass smudges build up slowly. When the pane pill warns you, a quick wipe brings the shine back.",
          ],
        },
        {
          icon: "thermo",
          title: "Temperature & Humidity",
          body: "Think in gradients, not single numbers — animals move to the conditions they need.",
          more: [
            "A warm side, a cool side and a mild night drop: the gradient does the work, the animal does the choosing.",
            "Each habitat has its own humidity: desert-dry for the gecko, jungle-wet for the frog.",
            "The Filters lenses paint live heat and humidity maps right over the habitat so you never have to guess.",
          ],
        },
        {
          icon: "flask",
          title: "The Nitrogen Cycle",
          body: "The invisible engine of the aquarium — waste becomes ammonia, bacteria make it safe.",
          more: [
            "Fish waste and uneaten food break down into ammonia, which is toxic even in small amounts.",
            "Helpful bacteria in the filter turn ammonia into nitrite (still toxic), then into nitrate, which is safe in moderation.",
            "Plants absorb some nitrate and water changes flush the rest. That's the whole cycle — and your meters show every step.",
          ],
        },
      ],
    },
    {
      title: "Species Encyclopedia",
      sub: "Everyone who can live in a GLASSWATER aquarium.",
      speciesGrid: true,
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "leaf",
        title: "Golden Rules",
        facts: [
          { label: "Observe first", value: "Warnings say what to fix" },
          { label: "Feed small", value: "Leftovers foul habitats" },
          { label: "Clean gently", value: "Little and often" },
        ],
      },
      {
        icon: "chart",
        title: "Live Scores",
        note: "Every habitat card on the hub shows its live score. 80+ means thriving; the score breakdown lists exactly what's missing.",
      },
    ],
  },
  checklist: {
    title: "New Keeper Checklist",
    items: [
      { label: "Visit all three habitats", done: true },
      { label: "Feed each animal once", done: true },
      { label: "Try a cleaning tool", done: true },
      { label: "Read Habitat Setup", done: false },
      { label: "Take a photo for the album", done: false },
    ],
  },
};

const FEEDING: CareTabDef = {
  id: "feeding",
  label: "Feeding",
  hero: {
    title: "Feeding",
    tagline: "Real nutrition — every insect and every pinch has consequences.",
    body:
      "Meals in GLASSWATER carry real numbers: satiety, fat, calcium and moisture. Staple insects build health, treats build weight, and calcium dusting is how keepers prevent metabolic bone disease. One rule of thumb covers portion size: never offer an insect longer than the space between your gecko's eyes.",
    art: `${ART}/feeding_hero.jpg`,
    artAlt: "The gecko stalking live crickets across the sand",
    caption: "A real hunt, captured in Sunstone Desert",
  },
  strip: [
    { icon: "bowl", label: "Adult Gecko", value: "Every 2–3 days" },
    { icon: "sparkle", label: "Dusting", value: "Calcium + D3, light" },
    { icon: "drop", label: "Water", value: "Fresh, shallow dish" },
    { icon: "fish", label: "Aquarium", value: "Small pinches" },
    { icon: "heart", label: "Treats", value: "Sparingly" },
  ],
  sections: [
    {
      title: "Feeder Insects",
      sub: "Straight from the vivarium's real nutrition table.",
      cards: FEEDER_CARDS,
    },
    {
      title: "Good Practice",
      cards: [
        {
          icon: "sparkle",
          title: "Calcium Dusting",
          body: "Insects alone are calcium-poor. Dust feedings so the calcium store never drains.",
          more: [
            "Insects have far more phosphorus than calcium, so an undusted diet slowly drains the body's calcium store. That's how metabolic bone disease starts.",
            "A light dusting of calcium powder at most feedings is enough — pick the supplement in the Feed drawer and it's applied automatically.",
            "D3 helps the body absorb calcium. It matters most if you skip UVB lighting, which is a fine choice for this species.",
          ],
        },
        {
          icon: "drop",
          art: `${ART}/card_water_dish.jpg`,
          title: "Hydration",
          body: "A shallow dish, always fresh — plus the moisture that rides in on juicy prey.",
          more: [
            "Keep the water shallow enough to stand in. Leopard geckos cannot swim, so a deep bowl is a real hazard.",
            "Stale water turns visibly murky in-game. Refill Water in the Clean drawer is a held pour — you'll see the dish fill back up.",
            "The frog is the opposite story: it drinks through its skin, from humid air and pond soaks, not from a bowl.",
          ],
        },
        {
          icon: "chart",
          title: "Track Intake",
          body: "The feeding log remembers every meal — balance staples against treats.",
          more: [
            "Open Track Intake from the Feed drawer to see diet-balance meters and every logged meal with a photo.",
            "Appetite is real: a full gecko stops eating and walks away mid-session. That's healthy, not fussy.",
            "Served isn't the same as eaten. Uneaten feeders wander off and burrow away after a while, so check what actually went down.",
          ],
        },
        {
          icon: "fish",
          art: `${HABITAT_ART}/sapphire_stream.jpg`,
          title: "The Other Mouths",
          body: "Fish chase sinking bits; the frog ambushes live crickets.",
          more: [
            "In the aquarium, click the water to aim a pinch. Flakes, pellets and bloodworms all consume your real stock.",
            "Whatever the fish don't eat becomes ammonia — the Nitrogen Cycle card in Overview explains why that matters.",
            "In Emerald Hollow, release a few crickets and let the frog do the rest. Three or four per feeding is plenty.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "bowl",
        title: "Portions & Pacing",
        facts: [
          { label: "Adult gecko", value: "Every 2–3 days", tint: "amber" },
          { label: "Juveniles", value: "Daily, smaller prey", tint: "amber" },
          { label: "Prey size", value: "Fits between the eyes", tint: "amber" },
          { label: "Aquarium", value: "A pinch, once a day", tint: "blue" },
          { label: "Tree frog", value: "3–4 crickets", tint: "green" },
        ],
      },
      {
        icon: "sparkle",
        title: "Supplements",
        note: "Dust feeder insects lightly with calcium (+D3) at most feedings. Skip the dust on treats — they're rare anyway.",
      },
    ],
  },
  checklist: {
    title: "Feeding Checklist",
    items: [
      { label: "Feeders in stock", done: true },
      { label: "Dust before serving", done: true },
      { label: "Portion, don't pile", done: true },
      { label: "Fresh water in the dish", done: true },
      { label: "Check the intake log weekly", done: false },
    ],
  },
};

const HABITAT: CareTabDef = {
  id: "habitat",
  label: "Habitat Setup",
  hero: {
    title: "Habitat Setup",
    tagline: "Create a safe, comfortable desert home for your leopard gecko.",
    body:
      "A well-designed habitat supports thermoregulation, reduces stress, and encourages natural behaviors. The good news: it comes down to a handful of essentials — enough floor space, three kinds of hide, safe ground, shallow water and a reason to explore.",
    art: `${ART}/habitat_setup_hero.jpg`,
    artAlt: "A furnished leopard gecko desert terrarium",
    caption: "Your Sunstone Desert vivarium, as it looks right now",
  },
  strip: [
    { icon: "box", label: "Min Enclosure", value: "20 gal long" },
    { icon: "thermo", label: "Warm Hide", value: WARM },
    { icon: "snow", label: "Cool Hide", value: COOL },
    { icon: "leaf", label: "Substrate", value: "Loose & safe" },
    { icon: "star", label: "Enrichment", value: "Climb, hide, explore" },
  ],
  sections: [
    {
      title: "Habitat Setup Essentials",
      cards: [
        {
          icon: "box",
          art: `${ART}/card_enclosure.jpg`,
          title: "Enclosure Size",
          body: "Choose the right size enclosure for growth, comfort, and temperature gradients.",
          more: [
            "A 20-gallon long tank (about 76 × 30 cm of floor) is the accepted minimum for one adult. Bigger is always better, and floor space beats height — this is a ground gecko.",
            "A longer tank is what makes a true warm-to-cool gradient possible. In a small cube, everything ends up the same temperature and the gecko has nowhere to choose.",
            "Sunstone Desert is a 40-gallon-class terrarium, which is why your gecko has room to hunt, dig and patrol.",
          ],
        },
        {
          icon: "cave",
          art: `${ART}/card_hides.jpg`,
          title: "Hides & Shelter",
          body: "Provide a warm hide, cool hide, and plenty of secure places to retreat.",
          more: [
            "Three hides is the classic setup: one over the warm side, one on the cool side, and one kept humid for shedding.",
            "Hiding isn't sulking — it's security. A gecko with good cover is calmer and comes out more, not less.",
            "In Decorate mode the catalog carries six hide styles, and the Hide Coverage lens will audit your layout for you.",
          ],
        },
        {
          icon: "mound",
          art: `${ART}/card_substrate.jpg`,
          title: "Safe Substrate",
          body: "Use loose, natural substrates that support digging and are safe if accidentally ingested.",
          more: [
            "Fine, low-dust ground is safest. Avoid anything sharp, heavily scented, or so coarse it can't be licked off a lip.",
            "Loose substrate lets your gecko actually dig — a natural behavior worth keeping, and one the terrain brush fully supports.",
            "In Terrain mode you paint real materials (sands, clay, pebbles), and each one genuinely shifts heat and humidity in the simulation.",
          ],
        },
        {
          icon: "dish",
          art: `${ART}/card_water_dish.jpg`,
          title: "Water Dish",
          body: "Always provide a shallow dish of fresh, clean water for hydration and shedding.",
          more: [
            "Shallow is a hard safety rule: leopard geckos cannot swim, so the dish should only ever be standing-depth.",
            "Water goes stale. In-game it visibly murks over time — the held pour in the Clean drawer refreshes it.",
            "The second stone dish is the food bowl. It keeps worms from burrowing into the sand before they're eaten.",
          ],
        },
        {
          icon: "branch",
          art: `${ART}/card_climbing.jpg`,
          title: "Climbing Enrichment",
          body: "Add branches, ledges, and varied levels to encourage movement and exploration.",
          more: [
            "Keep climbs low and sturdy. Ground geckos love a lookout, but every fall has to land safely on sand.",
            "Your gecko genuinely climbs and perches on decor it can reach — watch it pick the low side of a rock and walk up.",
            "Every branch and ledge in the catalog is climb-tested against the game's real collision system, so nothing is just scenery.",
          ],
        },
        {
          icon: "sprout",
          art: `${ART}/card_plants.jpg`,
          title: "Plants & Decor",
          body: "Use sturdy plants and natural decor to create cover, shade, and visual security.",
          more: [
            "Desert succulents shrug off the heat and break up long sightlines — and broken sightlines mean a calmer gecko.",
            "Cover between hides gives a shy animal safe routes across open sand instead of a nerve-wracking sprint.",
            "The Decorate catalog holds 32 pieces across five categories, each with live habitat effects you can read before buying.",
          ],
        },
        {
          icon: "broom",
          art: `${ART}/card_cleaning.jpg`,
          title: "Cleaning Basics",
          body: "Spot clean daily and deep clean regularly to maintain a healthy, stress-free habitat.",
          more: [
            "Leopard geckos toilet in one chosen corner. Scoop that corner regularly and most of the work is already done.",
            "Wipe the glass when it smudges, refresh the water dish, and brush fouled sand as you spot it.",
            "All five cleaning tools are hands-on: scoop, brush, squeegee, sponge and pour. Nothing cleans itself while you watch.",
          ],
        },
        {
          icon: "gauge",
          art: `${ART}/card_lamp.jpg`,
          title: "Essential Equipment",
          body: "Thermometers, timers, lamps, and tools that make habitat care easy and reliable.",
          more: [
            "One basking lamp clamped over the warm side drives the whole temperature gradient — heat from above, like sun.",
            "Two thermometers, one at each end, prove the gradient instead of guessing it. Yours read live on the back glass.",
            "A UVB tube is optional for this species. Low levels can help calcium uptake, and the vivarium's tube is intentionally weak.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      TEMPS_GROUP,
      {
        icon: "drop",
        title: "Humidity",
        dial: { lo: HUMIDITY[0], hi: HUMIDITY[1], min: 0, max: 100, unit: "%", caption: "Ideal range" },
      },
      LIGHTING_GROUP,
    ],
  },
  checklist: {
    title: "Beginner Setup Checklist",
    items: [
      { label: "Enclosure 20 gal long minimum", done: true },
      { label: "Warm and cool hides", done: true },
      { label: "Safe, loose substrate", done: true },
      { label: "Shallow water dish", done: true },
      { label: "Thermometer warm & cool", done: true },
      { label: "Proper lighting & day/night cycle", done: true },
      { label: "Enrichment & decor", done: true },
      { label: "Monitor temps & humidity", done: false },
    ],
  },
};

const HEAT: CareTabDef = {
  id: "heat",
  label: "Heating & Lighting",
  hero: {
    title: "Heating & Lighting",
    tagline: "Build a gradient, not a temperature.",
    body:
      "Reptiles can't make their own body heat — they warm up and cool down by moving. Your whole job is a reliable warm side, a genuinely cooler retreat, and a steady day/night rhythm. Get those three right and the gecko handles the rest itself.",
    art: `${ART}/heat_hero.jpg`,
    artAlt: "The basking lamp's glow pooling on the warm side of the vivarium",
    caption: "The warm side of Sunstone Desert, lamp glow and all",
  },
  strip: [
    { icon: "thermo", label: "Warm Side", value: WARM },
    { icon: "snow", label: "Cool Side", value: COOL },
    { icon: "sun", label: "Day Length", value: "12–14 hours" },
    { icon: "clock", label: "Night", value: NIGHT },
    { icon: "bolt", label: "UVB", value: "Optional, low" },
  ],
  sections: [
    {
      title: "The Thermal Gradient",
      cards: [
        {
          icon: "sun",
          art: `${ART}/card_lamp.jpg`,
          title: "Basking Lamp",
          body: "One overhead lamp over the basking zone makes the warm side — heat from above, like sun.",
          more: [
            "Sunstone Desert's lamp is rim-clamped over the basking zone as part of the enclosure — exactly where a keeper would put it.",
            "Belly heat matters as much as air heat. The rock and sand under the lamp soak up warmth and radiate it long after lights-out.",
            "Never trust a guess. Read the warm-side gauge, not the feel of the room you're sitting in.",
          ],
        },
        {
          icon: "thermo",
          title: "Warm-to-Cool Layout",
          body: "Heat one end only. The other end staying cool IS the equipment working.",
          more: [
            "Put the warm hide under the lamp and the cool hide at the far end — the gecko will use both in a single day.",
            "A gecko shuttling between the two ends isn't restless. That's thermoregulation, and it means your layout works.",
            "The Heat filter lens paints the live temperature gradient over the sand so you can see it for yourself.",
          ],
        },
        {
          icon: "clock",
          title: "The Night Drop",
          body: "Lights off on schedule; a mild overnight cool-down is natural and healthy.",
          more: [
            "Run 12–14 hours of light and then real darkness. Dusk is when a leopard gecko naturally comes alive.",
            "Skip colored night bulbs — darkness is the correct night lighting, and it's when your gecko does its best patrolling.",
            "A drop into the night band is nothing to fix. Deserts get cool after dark, and geckos are built for it.",
          ],
        },
        {
          icon: "bolt",
          title: "UVB, Honestly",
          body: "Optional for leopard geckos — low-level UVB can help calcium uptake, D3 dusting covers the rest.",
          more: [
            "Leopard geckos are crepuscular and evolved with very little direct sun, so they don't depend on UVB like day-active lizards do.",
            "If you run UVB, keep it weak and make sure there's shade to escape into. The vivarium's tube is deliberately low-output.",
            "Whichever route you choose, pair it with proper calcium dusting — that's the part that isn't optional.",
          ],
        },
        {
          icon: "gauge",
          art: `${ART}/card_gauges.jpg`,
          title: "Trust the Gauges",
          body: "Two thermometers — warm and cool — turn guesswork into husbandry.",
          more: [
            "Check both ends at roughly the same time of day for a fair comparison — mornings run cooler everywhere.",
            "The twin gauges on the back glass read live, and the 8-stat strip carries basking and cool temperatures at all times.",
            "If both ends read the same, the gradient has collapsed — usually a lamp issue or too small a tank.",
          ],
        },
        {
          icon: "mound",
          art: `${ART}/card_substrate.jpg`,
          title: "Substrate & Heat",
          body: "The floor is part of the heating system — materials hold and release warmth differently.",
          more: [
            "Darker, denser ground holds noticeably more warmth; loose pale sand sheds it quickly after lights-out.",
            "This is real in the game: a painted material's heat retention biases the basking temperature by about a degree.",
            "Paint materials with the Terrain brush and watch the Heat lens respond — it's the fastest way to feel the system.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      TEMPS_GROUP,
      LIGHTING_GROUP,
      {
        icon: "bolt",
        title: "In the Game",
        note: "The basking lamp is part of the vivarium shell, the twin gauges read live, and painted substrate genuinely shifts the warm side.",
      },
    ],
  },
  checklist: {
    title: "Heat Checklist",
    items: [
      { label: "Lamp over the basking zone", done: true },
      { label: "Warm hide under the lamp", done: true },
      { label: "Cool retreat at the far end", done: true },
      { label: "Lights on a day/night rhythm", done: true },
      { label: "Glance at both gauges daily", done: false },
    ],
  },
};

const HEALTH: CareTabDef = {
  id: "health",
  label: "Health",
  hero: {
    title: "Health",
    tagline: "Small daily observations catch problems while they're still small.",
    body:
      "Appetite, weight, sheds, droppings and behaviour are the five vital signs. The Animal Info panel shows them live — this chapter explains what healthy looks like, and which changes mean it's time to act.",
    art: `${ART}/health_hero.jpg`,
    artAlt: "A close look at the gecko on the open sand",
    caption: "Daily once-over: bright eyes, plump tail, easy walk",
  },
  strip: [
    { icon: "fork", label: "Appetite", value: "Steady interest" },
    { icon: "chart", label: "Body Condition", value: "Plump tail, lean body" },
    { icon: "sparkle", label: "Sheds", value: "Complete, incl. toes" },
    { icon: "drop", label: "Hydration", value: "Drinks & soaks" },
    { icon: "flask", label: "Calcium", value: "Keep the store full" },
  ],
  sections: [
    {
      title: "The Vital Signs",
      cards: [
        {
          icon: "fork",
          title: "Appetite & Body Condition",
          body: "A healthy gecko eats with interest and carries its fat in its tail, not its armpits.",
          more: [
            "The tail is the fuel gauge: plump and carrot-shaped means well-fed, thin and bony means something's wrong.",
            "Skipping one meal is normal, especially around a shed. Refusing food for a week or more is a real signal.",
            "Body condition is tracked in-game too — fatty treats push it up, and genuine obesity erodes health over time.",
          ],
        },
        {
          icon: "flask",
          title: "Calcium & MBD",
          body: "Metabolic bone disease is the classic captive illness — and it's entirely preventable.",
          more: [
            "MBD develops when the diet lacks calcium or D3: bones soften, legs bow, and the jaw turns rubbery. No stage of that is quick to undo.",
            "Prevention is cheap and easy — a light calcium dust on most feedings keeps the store topped up.",
            "Watch the calcium meter in Animal Info. Green means protected; letting it drain is how trouble starts.",
          ],
        },
        {
          icon: "drop",
          title: "Hydration",
          body: "Fresh shallow water, juicy prey, and a humid hide cover hydration for a desert gecko.",
          more: [
            "Desert animals are efficient with water, but they still need it available at all times — that's the dish's whole job.",
            "Wrinkled, dented-looking skin outside of a shed can be a dehydration sign worth acting on.",
            "Moist feeders like crickets and dubia carry meaningful water into every meal — one more reason staples beat treats.",
          ],
        },
        {
          icon: "target",
          title: "Healthy Droppings",
          body: "Dark pellet, white urate cap, one chosen corner — that's textbook.",
          more: [
            "The white cap is urate, a desert animal's water-saving version of urine. It's supposed to be there.",
            "One bathroom corner is a genuine leopard-gecko habit — your gecko picks a spot and commits to it, which makes checkups easy.",
            "Eating well but producing nothing for a long stretch deserves a closer look at temperatures and hydration.",
          ],
        },
        {
          icon: "flower",
          title: "Stress Signals",
          body: "Freezing, glass-pacing, refusing food and hiding constantly are the loud ones.",
          more: [
            "The usual causes are new decor, too much handling, and temperature swings — all fixable.",
            "In-game stress rises from real triggers and shows in the stat strip. Fix the cause and the number follows.",
            "A safe hunt genuinely relieves stress — eating live prey is enrichment, not just dinner.",
          ],
        },
        {
          icon: "heart",
          title: "Warning Signs",
          body: "Know the red flags that mean act now, not later.",
          more: [
            "Rapid weight loss, sunken eyes, a kinked tail or a soft, rubbery jaw all mean something is already wrong.",
            "Stuck shed on the toes that survives a humid-hide session needs help before it tightens further.",
            "The HUD's warning pill always lists the most serious active issue first — treat it as your triage list.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "heart",
        title: "Healthy Vitals",
        facts: [
          { label: "Hunger", value: "Kept above 40%", tint: "green" },
          { label: "Stress", value: "Kept below 30%", tint: "green" },
          { label: "Comfort", value: "70% and rising", tint: "green" },
          { label: "Calcium", value: "Never let it drain", tint: "amber" },
        ],
      },
      {
        icon: "chart",
        title: "Where to Look",
        note: "Click your animal for the live Animal Info panel; View Detailed Stats keeps the full care history.",
      },
    ],
  },
  checklist: {
    title: "Daily Health Glance",
    items: [
      { label: "Ate with interest", done: true },
      { label: "Moving normally", done: true },
      { label: "Droppings look right", done: true },
      { label: "No stuck shed", done: false },
      { label: "Warning pill clear", done: false },
    ],
  },
};

const BEHAVIOR: CareTabDef = {
  id: "behavior",
  label: "Behavior",
  hero: {
    title: "Behavior",
    tagline: "Learn what normal looks like, and the odd days will announce themselves.",
    body:
      "Leopard geckos are dusk-and-dawn ambush hunters with strong habits — a favourite hide, a chosen bathroom corner, a personal appetite for climbing. Your gecko in Sunstone Desert runs on the same instincts, so everything on this page is watchable in your own tank.",
    art: `${ART}/behavior_hero.jpg`,
    artAlt: "The gecko out patrolling beside the basking rocks",
    caption: "An evening patrol past the basking rocks",
  },
  strip: [
    { icon: "gecko", label: "Activity", value: "Dawn & dusk" },
    { icon: "target", label: "Hunting", value: "Ambush stalker" },
    { icon: "house", label: "Hiding", value: "Normal & healthy" },
    { icon: "heart", label: "Personality", value: "Five characters" },
  ],
  sections: [
    {
      title: "Reading Your Gecko",
      cards: [
        {
          icon: "house",
          art: `${ART}/card_hides.jpg`,
          title: "Hiding Is Healthy",
          body: "A midday gecko in a hide is doing exactly what wild ones do.",
          more: [
            "Crepuscular animals rest through the bright hours and patrol at dawn and dusk. Midday hiding is the schedule working.",
            "The gecko to worry about is the one that never comes out at all — not the one that naps through lunch.",
            "After a meal it often digests in the warm hide, because belly heat genuinely helps digestion.",
          ],
        },
        {
          icon: "target",
          title: "Stalk, Creep, Dash",
          body: "The hunt is three acts: a deliberate walk, a frozen creep, then an explosive strike.",
          more: [
            "Watch a feeding from start to finish: your gecko stalks the cricket, freezes inside about half a metre, then dashes.",
            "Tail flicks during the creep mean focus, not stress — it's the wind-up before the strike.",
            "A successful hunt visibly relieves stress in-game, because in real life hunting is exercise and enrichment in one.",
          ],
        },
        {
          icon: "branch",
          art: `${ART}/card_climbing.jpg`,
          title: "Climbing & Perching",
          body: "Ground geckos still love a low lookout — rocks and driftwood get real use.",
          more: [
            "Your gecko climbs onto climbable decor and genuinely stays there to bask or survey the sand.",
            "It approaches from the low side and picks routes the collision world actually allows — watch it plan a path.",
            "Bolder personalities perch more; shy ones stick closer to cover. Both are normal.",
          ],
        },
        {
          icon: "gecko",
          title: "Five Personalities",
          body: "Every gecko rolls a real character — bold, shy, lazy, curious or feisty.",
          more: [
            "Personality drives real differences in the simulation: walking speed, appetite, sheltering, startle response and climbing.",
            "It persists with your save. Your gecko's character is its own, and it won't change tomorrow.",
            "There's no wrong personality — just different care rhythms. A shy gecko needs more cover, a bold one more to explore.",
          ],
        },
        {
          icon: "flower",
          title: "Startle & Stress",
          body: "Fast movement overhead reads as a predator — slow hands make calm animals.",
          more: [
            "In the wild, death comes from above. Anything quick over the tank triggers the same wiring, so move slowly and low.",
            "A startled gecko bolts for cover. Give it a minute to settle rather than chasing it back out.",
            "Never grab or restrain the tail — a threatened gecko can drop it. It regrows, but never quite the same.",
          ],
        },
        {
          icon: "sparkle",
          title: "The Bathroom Corner",
          body: "One corner, always — a tidy instinct that makes your job easier.",
          more: [
            "Leopard geckos pick one toilet corner — usually the spot farthest from their hides and dishes — and stick to it.",
            "That habit is real in the game: same gecko, same corner, every time, saved with your vivarium.",
            "Scoop that one corner regularly and the habitat mostly keeps itself presentable.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "gecko",
        title: "Leopard Gecko at a Glance",
        facts: [
          { label: "Lifespan", value: "10–20 years" },
          { label: "Adult size", value: "18–25 cm" },
          { label: "Diet", value: "Insects only" },
          { label: "Active", value: "Dawn & dusk" },
          { label: "Company", value: "Lives alone" },
          { label: "Care level", value: "Beginner-friendly", tint: "green" },
        ],
      },
      {
        icon: "heart",
        title: "Handling Note",
        note: "Move slowly and low — approaches from above read as predators. Let the gecko walk onto your open hand, support the whole body, and never hold the tail.",
      },
    ],
  },
  checklist: {
    title: "Behaviour Watch",
    items: [
      { label: "Out and about at dusk", done: true },
      { label: "Hunts with focus", done: true },
      { label: "Uses more than one hide", done: true },
      { label: "No glass pacing", done: false },
      { label: "Startles are rare", done: false },
    ],
  },
};

const SHEDDING: CareTabDef = {
  id: "shedding",
  label: "Shedding",
  hero: {
    title: "Shedding",
    tagline: "A dull, grey gecko isn't sick — it's about to be brand new.",
    body:
      "Adults shed roughly once a month; fast-growing juveniles as often as every week or two. A healthy shed comes off in one sitting and usually gets eaten. Your job is simple: one humid retreat, and a look at the toes and tail tip afterwards.",
    art: `${ART}/shedding_hero.jpg`,
    artAlt: "The humid hide — the vivarium's shedding retreat",
    caption: "The humid hide, where sheds happen",
  },
  strip: [
    { icon: "sparkle", label: "Adults", value: "About monthly" },
    { icon: "drop", label: "Humid Hide", value: "70–80% inside" },
    { icon: "clock", label: "Duration", value: "About a day" },
    { icon: "target", label: "Check After", value: "Toes & tail tip" },
  ],
  sections: [
    {
      title: "The Shed Cycle",
      cards: [
        {
          icon: "sparkle",
          title: "Signs It's Coming",
          body: "Colours dull, skin turns papery-grey, appetite often dips for a day or two.",
          more: [
            "A pre-shed gecko fades to a dull grey-white, hides more, and may refuse food. All of it is normal.",
            "From the first dulling to done is usually a day or two, and the shed itself often happens overnight.",
            "Juveniles shed far more often than adults — every week or two — simply because they're growing fast.",
          ],
        },
        {
          icon: "cave",
          title: "The Humid Hide",
          body: "One hide with moist substrate inside is the single best shedding tool.",
          more: [
            "Inside the hide wants 70–80% humidity while the rest of the desert stays dry — a private steam room, not a wet tank.",
            "Damp moss or a moist patch inside does the work. Refresh it as soon as the colours start to dull.",
            "The Decorate catalog carries a dedicated Humid Shed Hide, and your vivarium already has one placed.",
          ],
        },
        {
          icon: "drop",
          title: "Boosting Humidity",
          body: "During a shed, add moisture locally — never soak the whole desert.",
          more: [
            "The Terrain drawer's Wet tool paints damp patches exactly where you want them, and nowhere else.",
            "Ambient humidity should stay in the dry desert band. The humid hide is the one deliberate exception.",
            "A shallow warm soak is a rescue tool for already-stuck shed — not a routine part of shedding.",
          ],
        },
        {
          icon: "target",
          title: "Stuck Shed",
          body: "Toes, tail tip and eyelids are where trouble starts — check them after every shed.",
          more: [
            "Stuck rings around toes tighten as they dry, and ignored long enough they can cost the toe. This is the one shed problem that really matters.",
            "First response is always more humidity: time in the humid hide, not fingers.",
            "If a piece still won't lift after a humid session, a brief shallow warm soak softens it safely.",
          ],
        },
        {
          icon: "heart",
          title: "Never Peel",
          body: "Pulling shed that isn't ready tears new skin underneath.",
          more: [
            "If it doesn't lift freely, it isn't done. Add humidity and give it time — skin wins over impatience.",
            "Don't be alarmed when the shed disappears: eating it is normal recycling, not a symptom.",
            "Expect a hungry gecko the day after a shed. Appetite usually returns with enthusiasm.",
          ],
        },
      ],
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "drop",
        title: "Humid Hide Target",
        dial: { lo: 70, hi: 80, min: 0, max: 100, unit: "%", caption: "Inside the hide only" },
      },
      {
        icon: "sparkle",
        title: "Ambient Stays Dry",
        note: "The rest of the vivarium keeps its desert humidity — only the hide's microclimate runs wet.",
      },
    ],
  },
  checklist: {
    title: "Shed Support",
    items: [
      { label: "Humid hide in place", done: true },
      { label: "Moisten it when colours dull", done: false },
      { label: "Leave the gecko be during the shed", done: true },
      { label: "Check toes & tail after", done: false },
      { label: "Expect a hungry gecko next day", done: true },
    ],
  },
};

const FAQ: CareTabDef = {
  id: "faq",
  label: "FAQ",
  hero: {
    title: "FAQ",
    tagline: "Quick answers to the questions every new keeper asks.",
    body: "Tap a question to open it. If your answer isn't here, the live Animal Info panel and the Filters lenses usually know.",
  },
  strip: [],
  sections: [],
  faq: [
    {
      q: "Can leopard geckos live together?",
      a: "No — they're solitary, and cohabiting causes stress and injuries (males will fight). One gecko per vivarium is correct and natural, which is why Sunstone Desert houses exactly one.",
    },
    {
      q: "Can my gecko swim?",
      a: "No. Leopard geckos cannot swim, so water is only ever offered as a shallow dish they can stand in. Deep water is genuinely unsafe for this species.",
    },
    {
      q: "Why does my gecko hide all day?",
      a: "It's crepuscular — active at dawn and dusk, resting through the bright hours. Daytime hiding is healthy; look for patrols and hunting in the evening instead.",
    },
    {
      q: "How often should I feed?",
      a: "Adults eat every 2–3 days; juveniles daily with smaller prey. A good size rule: never offer an insect longer than the space between the gecko's eyes. In the game a meal genuinely holds for a session — a gecko that stops eating mid-feeding is full, not fussy.",
    },
    {
      q: "What's the white tip on the droppings?",
      a: "That's the urate — a desert animal's water-saving version of urine. A dark pellet with a white cap, left in one chosen corner, is exactly what healthy looks like.",
    },
    {
      q: "Do leopard geckos need UVB?",
      a: "It's optional. They're crepuscular and manage with dietary D3 from dusted feeders, but low-level UVB can still help calcium uptake — the vivarium's tube is intentionally weak.",
    },
    {
      q: "Why won't my gecko eat?",
      a: "The usual suspects: too cool a warm side, a shed on the way, stress from changes, or simply being full. Check the warning pill and Animal Info first — the cause is usually named there.",
    },
    {
      q: "Is it true geckos drop their tails?",
      a: "Yes — it's a last-resort escape trick called autotomy, and it's why hands never grab or pin a tail. A dropped tail regrows thicker and smoother, but the gecko loses its fat store in the process.",
    },
    {
      q: "What are Eco Points?",
      a: "The leaves 🍃 you earn by keeping habitats healthy. They buy feeders and food in the Supply Shop and pay for decor placed in Decorate mode.",
    },
    {
      q: "Why is the aquarium water turning green and murky?",
      a: "Cleanliness is slipping or the nitrogen cycle is overloaded — usually from overfeeding. Scrub the glass, vacuum the gravel, do a water change, and feed smaller pinches.",
    },
    {
      q: "How do I take pictures of my animals?",
      a: "Open Photo mode from any habitat (the camera button), frame your shot with the free camera, and press the shutter. The photo lands in the Photo Album, and the camera hops straight back to the normal view.",
    },
  ],
  quickRef: {
    groups: [
      {
        icon: "book",
        title: "Where to Look In-Game",
        facts: [
          { label: "Live meters", value: "Animal Info panel" },
          { label: "Care history", value: "View Detailed Stats" },
          { label: "Habitat audit", value: "Filters lenses" },
          { label: "Warnings", value: "The HUD pill" },
        ],
      },
      {
        icon: "leaf",
        title: "Still Stuck?",
        note: "Every chapter's Quick Reference carries the numbers, and the checklists make good triage lists.",
      },
    ],
  },
};

export const CARE_GUIDE_TABS: CareTabDef[] = [OVERVIEW, FEEDING, HABITAT, HEAT, HEALTH, BEHAVIOR, SHEDDING, FAQ];

/** The tab the guide opens on (the reference shows Habitat Setup active). */
export const CARE_GUIDE_DEFAULT_TAB: CareTabId = "habitat";

export function careTabById(id: CareTabId): CareTabDef {
  const tab = CARE_GUIDE_TABS.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown care guide tab: ${id}`);
  return tab;
}
