# ANIMAL BIOLOGY RESEARCH (cited) — for GLASSWATER data

> Researched 2026-07-02. Feeds the animal-info + husbandry data overhaul.
> Numbers are husbandry-community + vet-source consensus. See SOURCES.

## Leopard gecko (Eublepharis macularius)

### Sexing
- **Male:** two hemipenal bulges (base of tail behind vent) + bold V-row of
  pre-anal pores. Slightly larger, broader/blockier head, thicker neck.
- **Female:** flat vent, no bulges, pores tiny/absent. Slimmer head.
- Reliably sexable ~6 months / 35–40 g; unmistakable by ~10 months.

### Sociality — SOLITARY (confirmed)
- Asocial, solitary, territorial. Do NOT get lonely — a companion is a
  STRESSOR, not enrichment. Default = one per enclosure.
- Male–male: never (fighting). Male–female: constant breeding stress on female.
  Female pairs: still risky (resource competition, bullying, dropped tails).
- Game model: companionship neutral-to-negative; "alone" is healthy. Crowding
  penalty, NO loneliness penalty.

### Swimming — CANNOT SWIM
- Poor swimmer, desert-adapted. Deep water = drowning risk (tires, panics).
- Water dish must be SHALLOW ≤ ~1 inch (2.5 cm) — must touch bottom, self-rescue.
- Game logic: shallow dish safe; deep water = stress/drown hazard, never sought.

### Husbandry bands
| Parameter | Value |
|---|---|
| Basking surface | 94–97 °F / 34–36 °C |
| Warm hide | 90–92 °F / 32–33 °C |
| Cool side | 70–77 °F / 21–25 °C |
| Night minimum | ≥ 60 °F / 16 °C |
| Ambient humidity | 30–40 % |
| Humid hide microclimate | 70–80 % |
| UVB | Ferguson Zone 1 (low). UVI 0.5–1.5 wild-type; 0.5–0.7 albino. Beneficial not mandatory w/ D3. |
| Adult size | 7–10 in / 17–25 cm |
| Adult weight | F ~45–70 g, M ~60–90 g |
| Lifespan | 15–20 yr captive |
| Activity | Crepuscular (dawn/dusk), low-light |

- Substrate: naturalistic soil/sand-soil OK for healthy heated adults; loose
  sand = impaction risk (juveniles/sick/underheated). Tile/bioactive = low risk.
- Feeding: hatchling/juvenile daily; young adult every other day; adult every
  4–5 days. ~2 insects per inch of length; prey no wider than space between eyes.
- Supplements: calcium (no D3) light dust MOST feeds; multivit/D3 ~1×/wk.
  Under → MBD; over-D3 → toxicity.
- Shedding: goes dull/white, sheds in patches, eats the shed. Low humidity →
  stuck shed (toes/eyes).
- Tail: fat/energy reserve (thick = well-fed). Autotomy (voluntary drop) when
  grabbed/stressed; regrows blunter. Brumation: seasonal cool-period dormancy.

### Behaviors to simulate
- Cryptic basking: pokes limb/nose into warm zone, body hidden (not a lounger).
- ≥3 hides (warm, cool, humid); retreats when stressed/digesting.
- Glass surfing = STRESS signal (too hot/small/hungry/reflection-as-rival).
- Tail: slow side wave (raised) = hunting/stalking; fast tip rattle = excitement/
  strike-imminent or male courting; slow defensive raise = wary/threatened.
- Toileting: ONE latrine corner, away from hides/food, reused (confirmed).
- Hunting: ambush stalk → creep → tail-wave → explosive short strike.
- Vocal: squeak/chirp (startle/defensive), bark/creak (annoyed males), scream
  (very frightened).

## Other creatures (game's 10)

Buckets — **Fully aquatic (die in air):** cherry shrimp, neon tetra, guppy,
zebra danio, otocinclus, daphnia. **Amphibious/escape-prone (survive air briefly
if damp, climb out):** nerite snail, mystery snail. **Terrestrial (drown in
water):** feeder cricket (dry), dwarf white isopod (humid 70–80%, drowns if
submerged).

| Species | Sexing / asexual | Social (min group) | Water/land | Signature |
|---|---|---|---|---|
| Feeder cricket (*Acheta domesticus*) | ♀ long ovipositor; only ♂ chirp | colony feeder | terrestrial, drowns | ♂ stridulation, hind-leg jump |
| Cherry shrimp (*Neocaridina davidi*) | ♀ larger/deeper color, saddle/berried; ♂ paler slim | colony ≥5–10 | aquatic, desiccates | biofilm grazing, backward escape dart |
| Nerite snail (*Neritina natalensis*) | not visually sexable; eggs need BRACKISH → no FW breeding | solitary-tolerant | aquatic, climbs out (brief if damp) | algae grazer, escape artist |
| Neon tetra (*Paracheirodon innesi*) | ♀ rounder → bent stripe; ♂ slim straight | shoal ≥6 | aquatic | tightens to school when startled |
| Guppy (*Poecilia reticulata*) | ♂ bright + gonopodium; ♀ drab, gravid spot; livebearer, stores sperm | group, 2–3 ♀ per ♂ | aquatic | constant courtship, prolific |
| Zebra danio (*Danio rerio*) | ♂ slim gold-tint; ♀ round silver; size unreliable | shoal ≥5–6 | aquatic, jumper (needs lid) | hyperactive bold zig-zag |
| Otocinclus (*Otocinclus* sp.) | ♀ rounder/larger ~5cm; ♂ slim ~4cm | school ≥6 | aquatic | suckermouth algae rasp, belly-on-glass |
| Mystery snail (*Pomacea diffusa*) | ♂ penis sheath under right shell; ♀ larger, pink clutch above water; stores sperm | non-social | gill+lung, siphon to air, climbs out | siphon air-breathing, above-water eggs |
| Daphnia (*Daphnia* sp.) | cyclical parthenogenesis: all-♀ clones; makes ♂+resting eggs under stress | planktonic swarm | aquatic | hop-swim, filter-feed, cloud flees |
| Dwarf white isopod (*Trichorhina tomentosa*) | parthenogenetic — only ♀, asexual; 2–3mm, can't roll | colony cleanup | terrestrial, humid, drowns if submerged | detritivore, shy, burrows |

## Game-design UX patterns

- **Planet Zoo:** per-species min & max social group size as bars ("needs X
  adults"); group type (bachelor/mixed); alpha/dominance fights when overstacked;
  required space scales with headcount; exceeding max drops welfare.
- **JWE2:** single Comfort % expands into itemized need sub-bars (Social min/max,
  Territory, Environment ratios) tuned toward target bands; crossing a hard
  threshold flips to "Agitated" state.
- **Photo album (Pokémon Snap):** score axes Pose/Size/Direction/Placement/Other/
  Background + a 1–4★ behavior-rarity rank; totals gate a grade; feeds a Photodex
  you re-shoot. **Planet Zoo photo:** no scoring — HUD-off clean free-camera + DoF
  (presentation). Takeaway: scored, behavior-rarity photo journal on a clean
  hide-UI free-camera mode.

## SOURCES
ReptiFiles (sexing, temps, size), Zen Habitats (care sheet bands), PangoVet
(vet sexing), Pet Enthusiast / Dragon's Diet / Vet Desk (swimming), GeckoNest /
OnlineGeckos (tail signals), Reptile Direct (toileting corner), A-Z Animals
(vocal, weight), Reptile Centre (Ferguson zone), Lafeber (weight/lifespan),
Wikipedia (Leopard gecko, Neocaridina, Pomacea, Daphnia, Trichorhina),
Aquatic Arts (shrimp/nerite sexing), Aquarium Breeder (nerite brackish),
Tankarium/Aqulator (neon), Fishkeeper (guppy ratio), Nature Sci Reports
(zebrafish shoal), Aquarium Co-Op (oto ≥6), Aquifarm (mystery siphon),
BreedingInsects/PubMed (cricket ovipositor/chirp), Bio Dude/Terrarium Tribe
(isopod humidity). Game refs: Planet Zoo help centre, JWE2 wiki, Game8/Serebii
(Snap scoring).
