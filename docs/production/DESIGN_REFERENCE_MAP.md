# DESIGN REFERENCE MAP — `Designs/Gecko/`

> Source-of-truth mapping for the UI reference-match pass (2026-07-01).
> Every image in `Designs/Gecko/` inspected. One **primary** reference chosen
> per game screen/mode. "Copy" = layout, hierarchy, panel shape, styling.
> "Don't copy" = elements that are AI-render noise or out of scope.

## The 10 images

| # | Filename | Screen / mode | Role |
|---|----------|---------------|------|
| 1 | `ChatGPT Image Jul 1, 2026, 03_04_29 PM (1).png` | **Gecko Main Gameplay** | **PRIMARY — master style source** |
| 2 | `ChatGPT Image Jul 1, 2026, 03_04_30 PM (6).png` | Gecko Main Gameplay (variant) | Secondary (stat-item anatomy: label + bar + status + %) |
| 3 | `ChatGPT Image Jul 1, 2026, 03_22_09 PM.png` | **Cleaning Mode** | PRIMARY for clean |
| 4 | `ChatGPT Image Jul 1, 2026, 02_57_21 PM.png` | **Feeding Mode** | PRIMARY for feed |
| 5 | `ChatGPT Image Jul 1, 2026, 03_04_31 PM (7).png` | **Terrain Mode** | PRIMARY for terrain |
| 6 | `ChatGPT Image Jul 1, 2026, 03_04_30 PM (4).png` | **Decorate Mode** (shown on aquarium) | PRIMARY for decorate (gecko + aquarium) |
| 7 | `ChatGPT Image Jul 1, 2026, 02_12_27 PM (6).png` | **Animal Info panel** (over gecko main) | PRIMARY for animal-info; secondary for dock subtitles + corner buttons |
| 8 | `ChatGPT Image Jul 1, 2026, 03_04_31 PM (8).png` | **Photo / Minimal View** | PRIMARY for photo mode |
| 9 | `ChatGPT Image Jul 1, 2026, 02_17_09 PM (8).png` | **Aquarium Main** | PRIMARY for aquarium HUD language |
| 10 | `ChatGPT Image Jul 1, 2026, 02_12_27 PM (2).png` | **Main Menu / Eco-Center Hub** | PRIMARY for hub (mood + button list) |

## Shared design language (from #1, confirmed everywhere)

- **Dark rounded glass panels**: near-black `rgba(12,13,12,~0.82)` + backdrop
  blur, 18–24 px radius, 1 px `rgba(255,255,255,0.07)` border, soft drop shadow.
- **Green accent** (active/positive): bright leaf-green `#7bd45–#8ee65a` range —
  active card outline + soft glow, values, check badges, progress ring.
- **Amber accent** (warm/attention): `#f0b94b` — temperature, warnings,
  "1 area dusty"-style pills, lamp warmth.
- Text: white titles (semibold), light-gray secondary (`#b8bdb8`), italic
  scientific name, green species line.
- **Pill tags**: dark pill, small icon + label (Desert / Warm / Lowlands).
- Buttons: dark rounded rows with chevron ›; one big **primary green** CTA
  (white text) per drawer max; circular dark icon buttons at screen corners.
- UI floats over the scene; tank remains the hero (center ~60% clear).

## Per-screen contracts

### 1. Gecko Main — `03_04_29 PM (1).png` (primary), `03_04_30 PM (6).png` (secondary)
**Copy:** top-left identity card (square photo thumb, name + leaf, species in
green, *Eublepharis macularius*, 3 pill tags); top-right Habitat Score card
(label + ⓘ, big green number + "Excellent", circular progress ring with leaf,
"Your gecko is thriving!", full-width "View Detailed Stats ›" button); camera
icon button under the score card at the right edge; bottom **stat strip** (one
rounded bar, 8 items: Hunger, Hydration, Stress, Health, Comfort, Cleanliness,
Temperature, Humidity — icon + label, slim colored bar, status word + value from
#2); bottom **action dock** (5 large cards: Feed / Clean / Decorate / Terrain /
Animal Info — icon, bold label, gray subtitle, green-outline active state,
notification dots) flanked by circular menu (left) + settings (right) buttons.
**Don't copy:** the photoreal room/tank render itself (ours is the live 3D
scene); wooden mission plaque + mug (scene props, not UI).

### 2. Cleaning Mode — `03_22_09 PM.png`
**Copy:** bottom drawer with header "🧹 Cleaning Mode — Keep your habitat
healthy"; 4–5 tool cards (Spot Clean / Brush Sand / Replace Water / Remove
Waste [+ Wipe Glass]) each icon + title + 2-line description + status pill
(green "2 spots detected" / amber "1 area dusty"); selected card green outline
+ ✓; amber sparkle rings on dirty spots in the tank; slim icon+label bottom nav
with green active underline (replaces the big dock while in a drawer mode).
**Don't copy:** nothing significant — full match target.
**Replaces:** the old tall right-side cleaning task list (kept OFF as main UI).

### 3. Feeding Mode — `02_57_21 PM.png` — ✅ FULL MATCH (v8)
**Copied (all of it):** headerless bottom drawer; left method rail (Quick Feed,
Hand Feed, Tongs, Place in Dish, Track Intake — designed SVG icons, green
active pill); "FOOD" section with **5 REAL photo cards cropped from this very
reference** (`public/assets/ui/food/*.png` — Mealworms / Superworms / Crickets /
Roaches / Treats ↔ kinds mealworm / superworm / cricket / dubia_roach /
waxworm), green border + ✓ badge on the selected card; QUANTITY stepper
(− 10 +, Small/Medium/Large caption), SUPPLEMENT dropdown (sun icon ·
Calcium + D3 · "Light dusting" · ▼ menu), NEXT FEEDING (calendar icon + an
HONEST live readout: cooldown / "Full — digesting" / appetite), big green
**Start Feeding · Observe & enjoy** CTA; the dashed teal placement ellipse
rides the sand under the pointer (red + reason when invalid; snaps to the
dish). Additions beyond the ref: ✕ close, 🎬 Cinematic button (full-screen
letterboxed eating cam), and Track Intake renders a real feeding log + diet
balance in the right pane.

### 4. Terrain Mode — `03_04_31 PM (7).png`
**Copy:** tab row on the drawer top edge (Terrain [active] · Decorate · Plants ·
Rocks · Substrate · Caves · Filters · Decor → ours: Terrain active + jump-to-
Decorate tab); floating left tool palette (Select, Raise [active], Lower,
Smooth, Flatten, Paint, Erase — 2-col grid of small cards); "Materials" row of
8 texture swatch cards (Desert Sand ✓, Fine Sand, Clay Mix, Rocky Soil, Pebble
Mix, Leaf Litter, Slate Edge, Dune Ridge); bottom styled sliders: Brush Size
(px readout) + Intensity (% readout) + reset circle button; brush ring in sand.
**Don't copy:** the garbled AI tool labels ("Emash", "Prant"); duplicate
Lower/Paint entries.
**Note:** materials are cosmetic swatches this pass (sculpt tools are real; the
material system paints the brush tint/wet where supported — no new terrain
physics).

### 5. Decorate Mode — `03_04_30 PM (4).png` (pattern applies to gecko too, per #5's tab row)
**Copy:** bottom tray: category tab row (Decorate [mode tab] + Plants / Rocks /
Driftwood / Substrate / Caves / Filters / Decor → ours: Rocks / Hides /
Branches / Plants / Hanging / Dishes); horizontal thumbnail card carousel
(GLB-rendered thumbs, selected = green outline + ✓, ‹ › chevrons, page dots);
floating left tool palette (Select / Move / Rotate / Delete); selected object
green outline + gizmo in-scene (already real).
**Don't copy:** nothing — but keep our inspector (transform values) reachable
via a compact "Advanced" flyout rather than a full right panel.

### 6. Animal Info — `02_12_27 PM (6).png`
**Copy:** right-side panel (~420 px, full-height card): header "Animal Info" +
✕; round-corner photo, big name "Sahara", "Leopard Gecko", Adult (2.1 yrs) +
sex chip; green status line "Active & Exploring" + caption sentence; **Live
Metrics** rows (icon + label left; slim bar + % + status word right):
Hunger, Hydration, Stress, Health, Comfort, Temperature Comfort, Humidity
Comfort, Shelter/Security, Enrichment, Cleanliness Exposure; Recommendations
box (leaf bullet lines); bottom 3 buttons: Feed / Focus / Habitat Details.
**Don't copy:** —
**Also source for:** dock subtitles ("Next in 1h 20m", "Spot clean habitat"),
bottom-left circular journal/camera/menu cluster, bottom-right circular leaf
button with badge.

### 7. Photo / Minimal — `03_04_31 PM (8).png`
**Copy:** ONLY compact identity card (no details button), compact score card
(no breakdown button), camera button at right edge. No stat strip, no dock, no
drawers.

### 8. Aquarium Main — `02_17_09 PM (8).png`
**Copy (safe-cosmetic):** same top-left card (Riverwood Aquascape / Planted
Freshwater), same score card, same stat-strip language for water stats (Water
Quality, Temperature, pH, Ammonia, Nitrite, Nitrate, Oxygen, Filter Flow),
same dock (Feed / Clean / Decorate / Terrain / Tank Info). Applies the same
`.gw-*` classes to the EXISTING 2D aquarium DOM where safe — no sim/tank
logic changes; the classic side panels stay (toggled), risk-minimal.

### 9. Main Menu / Hub — `02_12_27 PM (2).png`
**Copy (light):** GLASSWATER ECO-CENTER wordmark block + welcome line; vertical
menu cards (Continue / New Habitat / Collection / Settings) with icon + title +
subtitle; level/XP bar card; bottom chips (Daily Goals / Journal / Messages);
top-right keeper profile card. This styles the EXISTING screens/menu overlay —
no new game systems; menu items map to existing screens (some remain stubs).

## Mode → UI region matrix (implementation contract)

| Mode | Stat strip | Action dock | Drawer | Right panel | Top cards |
|-------------|-----------|-------------|-----------------|-------------|-----------|
| gecko-main | ✓ | ✓ (large) | — | — | full |
| feed | — | slim nav | feeding drawer | — | full |
| clean | — | slim nav | cleaning drawer | — | full |
| terrain | — | slim nav | terrain drawer | — | full |
| decorate | — | slim nav | decorate tray | — | full |
| animal-info | ✓ | ✓ (large) | — | Animal Info | full |
| photo | — | — | — | — | compact |

Esc always returns to gecko-main. Exactly one drawer/panel open at a time.
