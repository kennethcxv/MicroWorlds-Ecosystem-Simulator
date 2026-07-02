# HABITAT ANIMATION COMPARISON — fish vs spider vs lizard

_Spike date: 2026-06-30 · 3D viewport prototypes, Playwright-verified_

Goal: compare how well 3D rigging/animation/movement works across habitat types,
using the assets we actually have, to decide which habitats are worth keeping 3D.

**Headline:** every supplied animal is a **fused, unrigged** AI mesh (Tripo /
Meshy) — no skeleton, no skin, no animation clips. So the result is a test of
*procedural* animation on un-rigged geometry. That favours **swimmers and
crawlers** (fish, lizard) whose real motion is a body wave, and works **against
legged scuttlers** (spider) whose motion lives entirely in the limbs.

Screenshots: `screenshots/3d_spike/{habitat_fish, rigged_lizard_walk, rigged_spider_walk}.png`.

---

## ⭐ UPDATE 2026-06-30 (later) — animals are now RIGGED (real leg walking)

The sections below were the *first pass* (procedural-only on fused meshes, which
bounced/slid). We then **rigged the spider and lizard in Blender via MCP** and the
result is dramatically better — the legs actually step.

**Pipeline (free, no external paid services):**
1. Import the fused GLB into Blender (Blender MCP), join chunks, clean
   (`remove_doubles`, recalc normals).
2. Build an **armature** from geometry analysis — lizard: spine+tail+4 legs;
   spider: body + 8 legs placed at detected leg-tips (max-radius vertex per 45°
   sector).
3. **Automatic skin weights** (`parent_set ARMATURE_AUTO`) — bone-heat **succeeded**
   on both AI meshes after the cleanup (this is the step that usually fails; it
   didn't).
4. Author looping **walk + idle** clips (lizard: diagonal trot + spine/tail sway;
   spider: alternating-tetrapod leg swing) with the **body kept level (no bounce)**.
5. Export rigged GLB (`export_animation_mode='ACTIONS'`), downscale textures to
   1024² (`gltf-transform resize`), load in Three.js and play via **AnimationMixer**
   (`ThreeRiggedController`), crossfading walk↔idle by speed with cadence tracking
   travel so feet don't skate. The root only does locomotion/turning.

**Results (Playwright-verified):**
- **Lizard (leopard gecko): excellent.** Skinned deformation is clean (no
  tearing), all four legs step in a diagonal gait, spine/tail follow through, body
  stays level, head leads turns. Reads like a real walking gecko. → **keep 3D.**
- **Spider: good / much improved.** All 8 legs articulate in an alternating gait,
  body level, no tearing, scuttles + turns. Caveat: auto-placed leg bones on an
  AI mesh aren't anatomically perfect (a couple of legs are weighted a bit
  loosely), so it's "believable prototype" rather than "hand-animated AAA". A
  hand-cleaned rig (or a natively-rigged asset) would close the gap.
- **No bounce anywhere**, and the enclosures were stripped to just the animal +
  floor per the brief.

**Rig-accuracy fix (important):** the first auto-rigs placed bones blindly and the
**gecko's bones sat outside the body** — its mesh is posed on a *curved, diagonal
centerline*, not axis-aligned, so straight bones missed. Rebuilt from measured
geometry: spine/tail follow the per-Y-slice **centroid centerline**; legs run to
the **4 clustered foot toes**. Verified in Blender (got the viewport rendering in
SOLID mode) via top/side/posed screenshots — bones sit inside the limbs and the
skin deforms cleanly. The spider was rebuilt with a central body bone + 8 legs to
its true tips; Blender refuses to draw that Meshy mesh in-viewport, so its rig was
verified **in-engine** (clean deformation = bones are inside the body). A
**roam-inset** keeps both animals framed centrally.

**Revised verdict:** Blender auto-rig + procedural clips is a viable, free path to
real leg walking for these habitats. Lizard is ship-quality-ish now; spider is a
strong prototype that wants a hand-tuned rig. The architecture supports either
(`RiggedCreature` for skinned clips, `GroundCreature` as procedural fallback).

**Production-quality next step:** hand-weight/clean the auto-rigs (or commission
natively-rigged animals with named bones), add per-foot IK ground-locking for
zero skate, and 2-3 clips (idle/walk/dash) per species.

---

### (Original first-pass findings — procedural only, kept for the record)

## 1. Fish tank findings (baseline)
- Asset: betta + goldfish, fused Tripo colour-chunks, unrigged.
- Approach: unify chunks → one body mesh; GPU head→tail lateral body-wave (tail
  swish + undulation) + 3D steering (idle/cruise/dart, banking, depth, feeding).
- Result: **convincing.** Fish read as alive — depth swimming, banking turns,
  body flex. This is the strongest of the three because a fish IS basically a
  swimming body wave, which is exactly what the procedural deform produces.
- Verdict: **keep 3D.** Best fit for procedural animation.

## 2. Spider habitat findings
- Asset: `spider.glb` (Meshy), **one fully fused mesh**, unrigged, PBR textures.
- Approach: bursty grounded locomotion (scuttle → freeze → scuttle), eased yaw
  turning, small gait bob + fore/aft nod while moving, idle breathing. **No leg
  animation** — the legs are part of the fused shell with no bones/separation.
- Result: **partially convincing / honest limitation.** The spider moves, turns,
  starts/stops, and stays attached + in bounds with zero errors — but the legs
  don't articulate, so it reads as a *gliding* spider with a slight bob rather
  than a true scuttle. For a spider, the legs ARE the animation, so a fused mesh
  is the worst case.
- Verdict: **needs a rig** before it's shippable. Movement logic is fine; leg
  motion is the gap.

## 3. Lizard habitat findings
- Asset: `lizard.glb` (leopard gecko, Tripo), fused colour-chunks, unrigged.
- Approach: same unify-to-one-body + the body-wave reused as a **lateral spine
  undulation + tail follow-through** (which is how lizards actually crawl), plus
  grounded walk/idle steering, head-led turns, and idle breathing.
- Result: **surprisingly convincing.** The gecko walks head-first, the body and
  tail sway/curve naturally as it moves and settles, and it rests believably.
  Because a lizard's gait genuinely includes spine/tail undulation, the wave sells
  it even though the legs don't step.
- Verdict: **keep 3D (good).** Second only to fish for procedural fit. Stepping
  legs would be the cherry on top, not a blocker.

## 4. Which asset structures were usable
| Asset | Source | Structure | Rigged? | Usable as-is? |
|-------|--------|-----------|---------|---------------|
| Fish (betta/goldfish) | Tripo | fused colour-chunks (multi-mesh, offset origins) | ❌ | ✅ after unify-to-one-body |
| Spider | Meshy | single fused mesh, PBR | ❌ | ⚠️ body-only motion; legs need a rig |
| Leopard gecko | Tripo | fused colour-chunks | ❌ | ✅ after unify; wave fits the gait |

All needed the **unify-into-one-body** step (bake transforms + merge) so nothing
detaches. The gecko/spider 4096² textures were downscaled to 1024² with
`gltf-transform resize` (spider 42→3.8 MB, gecko 8.7→2.8 MB).

## 5. Which animation approaches worked
- **Procedural body-wave (head-anchored lateral sine)** — works great for fish,
  well for lizard (spine/tail). The single best technique for un-rigged organic
  bodies that move by undulation.
- **Grounded steering state machine (idle/move/dash, eased yaw, bounds)** — works
  for all land critters; cheap and robust.
- **Bursty locomotion + gait bob/nod** — an acceptable *stand-in* for a spider
  scuttle, but not a substitute for articulated legs.
- **What does NOT work without a rig:** per-leg stepping/articulation (spider
  legs, lizard feet). Procedural IK on a fused mesh isn't possible — there are no
  joints to drive.

## 6. Which approach looked best
1. **Fish** (procedural wave is a perfect match for a swimmer).
2. **Lizard** (wave maps onto real lizard spine/tail undulation).
3. **Spider** (movement OK, but missing leg articulation is conspicuous).

## 7. Most practical habitat type for GLASSWATER
**Aquatic (fish) first, then small ground reptiles/amphibians (lizard/gecko,
likely frog/turtle too).** These animate convincingly *today* from cheap
un-rigged assets via the body-wave + steering system already built. They reuse
one renderer, one enclosure builder, and one controller family — low marginal
cost per new species.

## 8. Should spider/lizard habitats stay 3D?
- **Lizard: YES.** Strong result now; will be excellent with a rig later.
- **Spider: CONDITIONAL.** Keep the habitat + movement system, but it only becomes
  shippable with a **rigged or part-separated** spider (legs). As-is it's a decent
  prototype but the lack of leg motion is the one thing players would notice.
  Arthropods (spider, and likely the millipede) are the **least** procedural-
  friendly of the supplied animals.

## 9. Asset structure needed for production quality
For believable limbs (the gap for spider, and the polish for lizard), source
animals should be one of:
1. **Rigged + skinned** — an armature with spine/tail/limb bones and clean weights
   (drive procedurally, or play baked idle/walk/scuttle clips). *Best.*
2. **Part-separated** — named objects (`Body`, `Tail`, `L_Leg1…`, `Head`, …) with
   sensible pivots at each attachment, animated by local rotation.

Plus: a single coherent body (or clean parts) in **one coordinate frame**,
consistent forward axis (+Z) and feet at y=0, ≤~20k tris, a single ≤1024² atlas,
and ideally 1–2 baked clips. The current fused/un-rigged assets are great for
swimmers/crawlers via the body-wave, adequate as movement prototypes for legged
animals, and insufficient for shippable legged articulation.

---

### Recommendation
Continue the hybrid 3D path for **fish and small reptiles/amphibians** using the
existing procedural system. Treat **legged arthropods (spider) as rig-gated** —
keep the prototype, but budget a rigged asset before committing it. The
architecture added here (one `HabitatScene` interface + `ThreeHabitatRenderer` +
shared enclosure/controller) makes each new habitat a small, contained addition.
