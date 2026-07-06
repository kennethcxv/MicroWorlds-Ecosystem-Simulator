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
| 5a | `ChatGPT Image Jul 2, 2026, 04_54_24 PM.png` | **Terrain editor — Terrain tab** | PRIMARY (FINAL, replaces the removed Jul 1 03_04_31 (7) image) |
| 5b | `ChatGPT Image Jul 2, 2026, 04_54_42 PM.png` | **Terrain editor — Filters tab** | PRIMARY (FINAL) |
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

### 4. Terrain editor — `Jul 2 04_54_24 PM.png` (Terrain) + `04_54_42 PM.png` (Filters) — ✅ FULL MATCH (v10.2)
**The editor has exactly TWO tabs: Terrain · Filters** (the Jul 1 ref's
Decorate/Plants/Rocks/… category tabs belong to other screens and were
removed per the final direction; the old Jul 1 terrain image is gone from
`Designs/Gecko/`).
**Terrain tab (copied):** single-column left tool stack Select · Paint ·
Raise [green-filled active] · Lower · Smooth · Erase (+ our compact Wet/Dry
pair keeping the humidity brushes; registry `src/data/terrainTools.ts`);
Materials photo tiles with the label INSIDE the card outline (cropped from
the Jul 1 ref art, `public/assets/ui/terrain/*.png`), selected = green
outline + ✓, locked = dim + padlock + "Future habitat"; selected-substrate
info card (desc/tags/5 stat meters/✓ Current/Apply/Revert); bottom pills
Brush Size (cm readout — ref says px; ours is honest world-space) ·
Intensity % · **⚡ Brush Mode chip Soft/Normal/Strong** (Strong = bedrock
limits) · round reset; the **in-world brush cursor** (white double ring +
green tool-glyph badge on the substrate). Tools are real: Erase =
flatten+dry reset brush; Select = inspect (gecko → info card); Paint lays
the selected material habitat-wide (per-cell painting TODO).
**Filters tab (copied):** left FILTERS list (Heat/Humidity/Hide Coverage/
Clutter/Dig Zones/Traffic Flow/Lighting — per-filter icon tints, active
green); main content (caps title + description, "<X> Score" card with big
number/status/green bar/"Recommended: …", verdict info card + View Details ›
→ the score breakdown flyout); gradient legend (Low/High) over a **top-down
analysis minimap** (live field + decor blobs); ABOUT THIS FILTER + amber
TIPS card; bottom Overlay Opacity/Intensity pills + ↺ Reset Filters. The
habitat itself gets the soft **AnalysisOverlay wash** (draped decal, live
fields from zones/wet map/decor/reachability/lamp; registry colour ramps;
`src/data/habitatFilters.ts`).
**Deliberate deviations:** the editor auto-raises the camera to the Top
vantage while open (our content-rich drawer would otherwise hide the floor
the ref shows; re-anchors on exit) + a small ✕ close button.
**v10.3 refinements (user direction):** the drawer compacted to ~24% of the
screen — a 2-col tool grid with a TOOL-CONTEXTUAL right panel (materials
only on Paint; sculpt tools get a context card with live Relief/Damp
meters); Select cut; substrates apply by PAINTING only (tile click = arm);
filters grew to 8 (+ Cleanliness from the live dirt map), all fields exact
to the collision/sim data, refreshing ~1 s; the wash is blur-smoothed with
a glass-edge fade; the minimap is a true 2× floor plan (exact contours,
dish tint, live gecko marker).

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

---

# DESIGN REFERENCE MAP — `Designs/Main_Menu/` (2026-07-05)

> Seven boards (`ChatGPT Image Jul 5, 2026, 12_25_01…12_25_43 AM.png`) define
> the FINAL main menu: the eco-center as a physical research lodge. The build
> (`src/ui/homeHub.ts` + `src/data/ecoCenter.ts`, v20) is a **synthesis** —
> no single board is copied, none is pasted as a background.

| Board (by time) | What it contributed | What we skipped |
|---|---|---|
| `12_25_01` (great hall) | Daily Care card copy ("Great work, Keeper!"), chips ON features, Current Habitats rows w/ icon+bar | Center waterfall conservatory |
| `12_25_09` (flat wall, numbered chips) | **PRIMARY layout**: chip row + thin stems down to features, photo wall right, desk/library center-right | Chip numbering (clutter) |
| `12_25_17` (circular atrium) | Top resource bar trio (Eco Points / Day·time / Restoration+View), Continue in brand panel | Circular room, center fountain |
| `12_25_23` (desk close-up) | Restoration progress bar w/ VIEW, View Habitat buttons, observation-notes mood | Desk-first camera (hides the tanks) |
| `12_25_29` (lounge) | "ECO-CENTER RESEARCH LODGE" subtitle, keeper-level pill, footer strip (day-part · motto), Healthy status rows | 18°C weather chip (no outdoor sim) |
| `12_25_37` (isometric cutaway) | Locked Restoration Wing w/ lock + "complete more restorations" copy | Isometric composition (future pass) |
| `12_25_43` (grand atrium) | Featured-habitat plaque language, CONTINUE CARING prominence | Community/Map/Tasks nav (not built) |

Build honesty rules: tanks = the real render plates; Photo Wall = the player's
real captures (empty frames on fresh profiles); Supply Corner = real decor
renders; restoration = the true 3-of-4 bays (75%); keeper level = the existing
reputation presentation; Daily Care = live `deriveReminders`.

**V2 pass (v20.1, same boards):** the cinematic qualities of `12_25_01`/
`12_25_09` were pushed further — visible rafter ceiling, dusk windows with a
moon behind the tank wall, walls-of-glowing-tanks (mini-tank racks under the
three real displays), plaque-style chips tight to their features (the long
callout stems from the first build are gone), per-habitat glow colors,
vignette + foreground foliage. Screenshots: `screenshots/main_menu_v2/`.

**V21 (superseded):** the hub was rebuilt as a TRUE CSS-3D room from
`…12_25_29 AM.png` (the one-point-perspective board). The user then corrected
the source of truth — see V23.

**V23 (THE ATRIUM — composition source is now `12_25_17`):** the single source
of truth for the main menu is **`ChatGPT Image Jul 5, 2026, 12_25_17 AM.png`**
(the circular atrium). The environment is a **rendered atrium backdrop
generated with gpt-image-1** to match that board (a UI-free art asset, NOT the
reference file) → `public/assets/ui/hub/eco_center_atrium.jpg`, with the real
live UI + 5 clickable habitat hotspots overlaid (`src/ui/homeHub.ts`). The
`12_25_17` UI mapping in the table above (top resource trio, brand+Continue,
Current Habitats, bottom dock, daily-care card, floating habitat signage) is
the layout implemented. `12_25_29` is retired; `12_25_01`/`12_25_09` remain
mood refs; `12_25_37` (isometric cutaway) stays a possible future camera.
Screenshots: `screenshots/main_menu_atrium/`.
