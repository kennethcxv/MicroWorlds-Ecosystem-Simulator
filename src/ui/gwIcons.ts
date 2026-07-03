/**
 * GW ICON SET — hand-drawn inline SVG icons matching the reference UI art
 * (Designs/Gecko): the food bowl, broom, sprout, dune and gecko silhouette of
 * the action dock, the colored stat glyphs of the stat strip, and the small
 * chrome icons (camera / menu / sliders / chevron / leaf / chart). Crisp
 * designed vectors — no emoji, no font-fallback weirdness. Each icon draws in
 * `currentColor`, so the caller picks the tint.
 */

export type GwIconName =
  | "fork"
  | "drop"
  | "flower"
  | "heart"
  | "house"
  | "sparkle"
  | "thermo"
  | "bowl"
  | "broom"
  | "sprout"
  | "mound"
  | "gecko"
  | "camera"
  | "menu"
  | "sliders"
  | "sun"
  | "mountains"
  | "leaf"
  | "chart"
  | "chevron"
  | "check"
  | "cricket"
  | "hand"
  | "tongs"
  | "dish"
  | "film"
  | "calendar"
  | "target"
  | "pane"
  | "bag"
  | "raise"
  | "lower"
  | "smooth"
  | "flatten"
  | "lock"
  | "reset"
  | "brushring"
  | "intensity"
  | "select"
  | "paint"
  | "erase"
  | "clutter"
  | "dig"
  | "traffic"
  | "bolt";

/** Inner SVG markup per icon (24×24 viewBox, drawn in currentColor). */
const PATHS: Record<GwIconName, string> = {
  // Fork + knife (hunger).
  fork: `<path fill="currentColor" d="M5.4 2.6c0-.5.4-.9.9-.9s.9.4.9.9v4.6c0 .5.4.9.9.9s.9-.4.9-.9V2.6c0-.5.4-.9.9-.9s.9.4.9.9v4.6c0 1.6-1 3-2.4 3.5v9.7c0 .7-.6 1.3-1.3 1.3s-1.3-.6-1.3-1.3v-9.7A3.7 3.7 0 0 1 3.6 7.2V2.6c0-.5.4-.9.9-.9s.9.4.9.9Z"/>
    <path fill="currentColor" d="M17.2 1.9c2 1.6 3.2 4.4 3.2 7.3 0 2.2-.8 3.9-2.2 4.7v6.5c0 .7-.6 1.3-1.3 1.3s-1.3-.6-1.3-1.3V3.1c0-1 .8-1.6 1.6-1.2Z"/>`,
  // Water drop.
  drop: `<path fill="currentColor" d="M12 2.4c.3 0 .5.1.6.4C14.5 5.7 19 11 19 15a7 7 0 0 1-14 0c0-4 4.5-9.3 6.4-12.2.1-.3.3-.4.6-.4Z"/>`,
  // Five-petal blossom (stress).
  flower: `<g fill="currentColor"><ellipse cx="12" cy="5.4" rx="2.6" ry="3.1"/><ellipse cx="18.2" cy="9.9" rx="2.6" ry="3.1" transform="rotate(72 18.2 9.9)"/><ellipse cx="15.8" cy="17.2" rx="2.6" ry="3.1" transform="rotate(144 15.8 17.2)"/><ellipse cx="8.2" cy="17.2" rx="2.6" ry="3.1" transform="rotate(-144 8.2 17.2)"/><ellipse cx="5.8" cy="9.9" rx="2.6" ry="3.1" transform="rotate(-72 5.8 9.9)"/><circle cx="12" cy="11.8" r="2.5" opacity="0.55"/></g>`,
  // Heart (health).
  heart: `<path fill="currentColor" d="M12 21C6.1 15.7 3 12.4 3 8.7A4.7 4.7 0 0 1 12 6.6 4.7 4.7 0 0 1 21 8.7c0 3.7-3.1 7-9 12.3Z"/>`,
  // House (comfort).
  house: `<path fill="currentColor" d="M12 3.2 3 10.6V21h6.4v-5.6h5.2V21H21V10.6L12 3.2Z"/>`,
  // Four-point sparkle + small star (cleanliness).
  sparkle: `<path fill="currentColor" d="M10 3l1.7 5.3L17 10l-5.3 1.7L10 17l-1.7-5.3L3 10l5.3-1.7L10 3Z"/><path fill="currentColor" d="M18 14l1 2.9 2.9 1-2.9 1-1 2.9-1-2.9-2.9-1 2.9-1 1-2.9Z"/>`,
  // Thermometer (temperature).
  thermo: `<path fill="currentColor" d="M12 2.5a2.6 2.6 0 0 1 2.6 2.6v8a4.9 4.9 0 1 1-5.2 0v-8A2.6 2.6 0 0 1 12 2.5Zm0 2a.6.6 0 0 0-.6.6v9.2l-.5.3a2.9 2.9 0 1 0 2.2 0l-.5-.3V5.1a.6.6 0 0 0-.6-.6Z"/><circle fill="currentColor" cx="12" cy="17.4" r="1.9"/>`,
  // Bowl of insects (feed).
  bowl: `<circle fill="currentColor" cx="9" cy="8.6" r="1.2"/><circle fill="currentColor" cx="13.4" cy="7.4" r="1.2"/><circle fill="currentColor" cx="15.6" cy="9.4" r="1.1"/><path fill="currentColor" d="M3.4 11.4h17.2c.5 0 .9.5.8 1A9 9 0 0 1 3.4 12.4a.85.85 0 0 1 .8-1Z"/><path fill="currentColor" d="M8.4 19.4h7.2v1.4H8.4z" opacity="0.85"/>`,
  // Angled broom (clean): long handle top-right, fanned bristles bottom-left.
  broom: `<path fill="currentColor" d="M20.1 2.7c.5.4.6 1.1.2 1.6l-6.1 7.1-1.8-1.5 6.1-7.1c.4-.5 1.1-.6 1.6-.1Z"/>
    <path fill="currentColor" d="M11.6 9.8c1.9.2 3.6 1.3 4.5 3l-1.8 1.6-8.9 6.4c-.6.4-1.4.3-1.9-.2l-1.2-1.4c-.5-.6-.4-1.4.2-1.9l6.2-5.4A5.3 5.3 0 0 1 11.6 9.8Z"/>
    <path fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5" d="m6.4 19.6 3.3-4.2m-5.5 2.6 3.6-3.9m6.5-.6-3.2 3.6"/>`,
  // Potted sprout (decorate).
  sprout: `<path fill="currentColor" d="M12 12.6c-.3-3.2-2.8-5.7-6.6-6.1-.4 0-.7.3-.7.7.2 3.7 3 6.3 6.5 6.3h.8Z"/><path fill="currentColor" d="M12.8 12.9c.2-2.6 2.3-4.6 5.4-5 .4 0 .7.3.7.7-.2 3-2.5 5.1-5.4 5.1h-.7Z" opacity="0.85"/><path fill="currentColor" d="M11.3 12h1.4v3.4h-1.4z"/><path fill="currentColor" d="M6.8 16h10.4l-.9 4.4a1.4 1.4 0 0 1-1.4 1.1H9.1a1.4 1.4 0 0 1-1.4-1.1L6.8 16Z"/>`,
  // Twin dunes (terrain).
  mound: `<path fill="currentColor" d="M14.6 6.4c.3-.4.9-.4 1.2 0l6 12a.8.8 0 0 1-.7 1.1h-12a.8.8 0 0 1-.7-1.1l6.2-12Z" opacity="0.75"/><path fill="currentColor" d="M8 10.2c.3-.4.9-.4 1.2 0l4.7 8.2a.8.8 0 0 1-.7 1.2H3.3a.8.8 0 0 1-.7-1.2L8 10.2Z"/>`,
  // Gecko silhouette, top view (animal info): head, teardrop body, 4 splayed
  // legs, curled tail — the classic gecko glyph.
  gecko: `<circle fill="currentColor" cx="12" cy="4.7" r="2.3"/>
    <path fill="currentColor" d="M12 6.6c1.9 0 3.1 1.5 3 3.4l-.3 3.2c-.2 1.9-1.2 3-2.7 3s-2.5-1.1-2.7-3L9 10c-.1-1.9 1.1-3.4 3-3.4Z"/>
    <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <path d="M9.7 8.9 6.5 7.2M14.3 8.9l3.2-1.7M9.9 12.9l-3 2.3M14.1 12.9l3 2.3"/>
    </g>
    <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 16.1c.3 1.9-.4 3.2-2 3.6-1.1.3-2.1-.1-2.6-.9"/>`,
  // Camera.
  camera: `<path fill="currentColor" d="M9 4.6c.3-.7.9-1.1 1.7-1.1h2.6c.8 0 1.4.4 1.7 1.1l.5 1.1h2.6A2.9 2.9 0 0 1 21 8.6v8a2.9 2.9 0 0 1-2.9 2.9H5.9A2.9 2.9 0 0 1 3 16.6v-8a2.9 2.9 0 0 1 2.9-2.9h2.6L9 4.6Zm3 3.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2Zm0 1.8a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z"/>`,
  // Hamburger menu.
  menu: `<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 7h15M4.5 12h15M4.5 17h15"/></g>`,
  // Settings sliders.
  sliders: `<g stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7.4h16M4 12h16M4 16.6h16"/></g><g fill="currentColor"><circle cx="9.4" cy="7.4" r="2.1"/><circle cx="15" cy="12" r="2.1"/><circle cx="8" cy="16.6" r="2.1"/></g>`,
  // Sun (Desert tag).
  sun: `<circle fill="currentColor" cx="12" cy="12" r="4.2"/><g stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></g>`,
  // Mountain range (Lowlands tag).
  mountains: `<path fill="currentColor" d="M8.2 7.1c.3-.5 1-.5 1.3 0l3 5 1.4-2.3c.3-.5 1-.5 1.3 0l5.6 9.1a.8.8 0 0 1-.7 1.2H3a.8.8 0 0 1-.7-1.2l5.9-11.8Z"/>`,
  // Leaf.
  leaf: `<path fill="currentColor" d="M20.3 3.7c.4 0 .7.3.7.7-.1 5.2-1.6 9.3-4.3 12-2.2 2.2-5.1 3.4-8.6 3.7-.9-1.5-1.4-3.2-1.4-4.9 0-6.6 5.4-11.2 13.6-11.5Z"/><path fill="none" stroke="#0d0e0c" stroke-width="1.2" stroke-linecap="round" d="M5.6 20.8C8.8 14.9 12.6 10.7 17.6 7.2" opacity="0.45"/>`,
  // Bar chart (view detailed stats).
  chart: `<g fill="currentColor"><rect x="4" y="12.5" width="3.4" height="7.5" rx="0.8"/><rect x="10.3" y="7.5" width="3.4" height="12.5" rx="0.8"/><rect x="16.6" y="4" width="3.4" height="16" rx="0.8"/></g>`,
  // Chevron ›.
  chevron: `<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m9.2 5.4 6.6 6.6-6.6 6.6"/>`,
  // Check ✓.
  check: `<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m4.8 12.6 4.6 4.6L19.2 7"/>`,
  // Side-view cricket (Quick Feed): body + head + antennae + big bent hind leg.
  cricket: `<ellipse fill="currentColor" cx="10.8" cy="13.9" rx="5.7" ry="3.4"/>
    <circle fill="currentColor" cx="16.9" cy="12.3" r="2.3"/>
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M18.3 10.8c.8-1.4 2-2.3 3.1-2.5M17.5 10.2c.1-1.4.8-2.7 1.7-3.4"/>
      <path d="m7.9 17-1 2.6M10.9 17.3l-.2 2.4M13.7 16.7l.9 2.3"/>
      <path d="M6.3 12C4.7 10.4 4.4 8.2 5.5 6.2"/>
      <path d="M5.5 6.2 4 11.4"/>
    </g>`,
  // Open hand, fingers up (Hand Feed).
  hand: `<path fill="currentColor" d="M8.1 12V5.4a1.2 1.2 0 0 1 2.4 0v5.2h.9V3.7a1.2 1.2 0 0 1 2.4 0v6.9h.9V5a1.2 1.2 0 0 1 2.4 0v7.3h.9V8.4a1.2 1.2 0 0 1 2.4 0v5.9c0 4-2.7 6.9-6.7 6.9-2.7 0-4.5-1-5.9-3.2l-2.7-4.2c-.6-.9-.4-1.9.3-2.4.7-.5 1.7-.4 2.3.3l.4.3Z"/>`,
  // Feeding tongs held tip-down (pivot top, pads at the tips).
  tongs: `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <path d="M11.5 4.4 7.6 19.3M12.5 4.4l3.9 14.9"/>
    </g>
    <circle fill="currentColor" cx="12" cy="3.8" r="1.9"/>
    <ellipse fill="currentColor" cx="7.2" cy="20.3" rx="1.5" ry="1.2" transform="rotate(-18 7.2 20.3)"/>
    <ellipse fill="currentColor" cx="16.8" cy="20.3" rx="1.5" ry="1.2" transform="rotate(18 16.8 20.3)"/>`,
  // Shallow stone dish (Place in Dish).
  dish: `<path fill="currentColor" d="M3.8 10.5c1.5 1.9 4.5 3.1 8.2 3.1s6.7-1.2 8.2-3.1v3.3c0 2.6-3.7 4.7-8.2 4.7s-8.2-2.1-8.2-4.7v-3.3Z"/>
    <ellipse fill="currentColor" cx="12" cy="9.6" rx="8.2" ry="3.3"/>
    <ellipse fill="#000" cx="12" cy="9.6" rx="5.7" ry="2" opacity="0.38"/>`,
  // Clapperboard (cinematic feeding).
  film: `<path fill="currentColor" d="M3.5 9.2h17v9A1.8 1.8 0 0 1 18.7 20H5.3a1.8 1.8 0 0 1-1.8-1.8v-9Z"/>
    <path fill="currentColor" d="M4.1 4.7 19.9 3l.4 3.6L4.5 8.3l-.4-3.6Z"/>
    <g stroke="#000" stroke-width="1.4" opacity="0.45"><path d="m7.4 4.5 1.9 2.9M11.8 4l1.9 2.9M16.2 3.6l1.9 2.8"/></g>`,
  // Calendar (next feeding).
  calendar: `<path fill="currentColor" d="M7 2.8c.6 0 1 .4 1 1v1h8v-1a1 1 0 1 1 2 0v1h.6A2.4 2.4 0 0 1 21 7.2v11.4A2.4 2.4 0 0 1 18.6 21H5.4A2.4 2.4 0 0 1 3 18.6V7.2a2.4 2.4 0 0 1 2.4-2.4H6v-1c0-.6.4-1 1-1Zm12 7.4H5v8.4c0 .2.2.4.4.4h13.2c.2 0 .4-.2.4-.4v-8.4Z"/>
    <g fill="currentColor" opacity="0.8"><rect x="7" y="12.2" width="3" height="2.6" rx="0.5"/><rect x="12" y="12.2" width="3" height="2.6" rx="0.5"/><rect x="7" y="16" width="3" height="2.6" rx="0.5"/></g>`,
  // Spot-clean target (crosshair + ring, the reference's first card).
  target: `<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="6.2"/><path d="M12 2.6v3.6M12 17.8v3.6M2.6 12h3.6M17.8 12h3.6"/></g><circle cx="12" cy="12" r="1.8" fill="currentColor"/>`,
  // Glass pane with a wipe streak (Wipe Glass).
  pane: `<rect x="4" y="3.6" width="16" height="16.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/>
    <path d="M8.2 15.8 15.6 7.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity="0.85"/>
    <path d="M11.4 17.6l5.4-6.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity="0.45"/>`,
  // Waste bag, cinched at the top (Remove Waste — the reference's amber sack).
  bag: `<path fill="currentColor" d="M9.6 5.2c.3-1 .9-1.7 2.4-1.7s2.1.7 2.4 1.7l.4 1.2c2.9 1.2 4.9 4.2 4.9 8.1 0 3.9-2.6 6-7.7 6s-7.7-2.1-7.7-6c0-3.9 2-6.9 4.9-8.1l.4-1.2Z"/>
    <path d="M9.4 6.6h5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>`,
  // Terrain: pile the sand up — dune with a rising arrow (reference tool card).
  raise: `<path fill="currentColor" d="M12 12.1c3.8 0 6.6 2.3 8.4 6.8a.85.85 0 0 1-.8 1.16H4.4a.85.85 0 0 1-.8-1.16c1.8-4.5 4.6-6.8 8.4-6.8Z"/>
    <g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9.4V3.6"/><path d="M8.9 6.4 12 3.3l3.1 3.1"/></g>`,
  // Terrain: dig a depression — dune with a sinking arrow.
  lower: `<path fill="currentColor" d="M12 12.1c3.8 0 6.6 2.3 8.4 6.8a.85.85 0 0 1-.8 1.16H4.4a.85.85 0 0 1-.8-1.16c1.8-4.5 4.6-6.8 8.4-6.8Z" opacity="0.8"/>
    <g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4v5.8"/><path d="M8.9 6.2 12 9.3l3.1-3.1"/></g>`,
  // Terrain: relax bumps — soft parallel dune ripples.
  smooth: `<g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
      <path d="M3.6 8.6c1.9-2.1 3.9-2.1 5.8 0s3.9 2.1 5.8 0 3.4-1.9 5.2-.5"/>
      <path d="M3.6 13.6c1.9-2.1 3.9-2.1 5.8 0s3.9 2.1 5.8 0 3.4-1.9 5.2-.5"/>
      <path d="M4.2 18.6h15.6" opacity="0.65"/>
    </g>`,
  // Terrain: back to level — ground bar pressed flat by two arrows.
  flatten: `<path fill="currentColor" d="M4.2 16.6h15.6a1 1 0 0 1 0 2H4.2a1 1 0 0 1 0-2Z"/>
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
      <path d="M8.2 4.6v7.2M5.6 9.2l2.6 2.6 2.6-2.6"/>
      <path d="M15.8 4.6v7.2M13.2 9.2l2.6 2.6 2.6-2.6"/>
    </g>`,
  // Padlock (locked future substrates).
  lock: `<rect x="5.6" y="10.4" width="12.8" height="9.6" rx="2.4" fill="currentColor"/>
    <path fill="none" stroke="currentColor" stroke-width="2" d="M8.4 10.4V7.9a3.6 3.6 0 0 1 7.2 0v2.5"/>
    <circle cx="12" cy="14.6" r="1.5" fill="#000" opacity="0.35"/><path d="M12 15.5v2" stroke="#000" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/>`,
  // Circular reset arrow ↺ (brush settings, reference's round bottom-right button).
  reset: `<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" d="M17.8 7.2A7.3 7.3 0 1 0 19.3 12"/>
    <path fill="currentColor" d="M19.9 3.2l-.5 5.1-4.7-2.1 5.2-3Z"/>`,
  // Dotted brush ring (Brush Size label, reference slider icon).
  brushring: `<circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.5 4.6"/>
    <circle cx="12" cy="12" r="1.7" fill="currentColor"/>`,
  // Dot-in-ring (Intensity label, reference slider icon).
  intensity: `<circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="3.1" fill="currentColor"/>`,
  // Selection marquee: dashed corners + centre dot (Select tool).
  select: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M4.2 8.2V6.4a2.2 2.2 0 0 1 2.2-2.2h1.8M15.8 4.2h1.8a2.2 2.2 0 0 1 2.2 2.2v1.8M19.8 15.8v1.8a2.2 2.2 0 0 1-2.2 2.2h-1.8M8.2 19.8H6.4a2.2 2.2 0 0 1-2.2-2.2v-1.8"/>
    </g><circle cx="12" cy="12" r="1.9" fill="currentColor"/>`,
  // Paintbrush: angled handle + fat bristle head (Paint tool).
  paint: `<path fill="currentColor" d="M19.8 3.5c.7.6.8 1.7.2 2.4l-7 8.1-2.7-2.3 7.1-8a1.7 1.7 0 0 1 2.4-.2Z"/>
    <path fill="currentColor" d="M9.3 12.7l2.9 2.5c-.3 2.5-1.9 4-4.7 4.6-1.4.3-2.8.2-4.1-.2 1-.9 1.5-1.9 1.6-3 .2-2 1.6-3.5 4.3-3.9Z"/>`,
  // Eraser block on a baseline (Erase tool).
  erase: `<rect x="5.6" y="7.2" width="13.4" height="8" rx="1.8" fill="currentColor" transform="rotate(-42 12.3 11.2)"/>
    <path d="M4.4 20h15.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
    <path d="m8.2 9.6 5.9 5.4" stroke="#000" stroke-width="1.6" opacity="0.3"/>`,
  // Scattered stones of mixed size (Clutter filter).
  clutter: `<g fill="currentColor"><circle cx="7" cy="7.4" r="2.5"/><circle cx="16.6" cy="6.3" r="1.8"/><circle cx="12.1" cy="12.6" r="3"/><circle cx="6.3" cy="17.2" r="2"/><circle cx="17.6" cy="16.8" r="2.6"/></g>`,
  // Arrow digging into sand ripples (Dig Zones filter).
  dig: `<g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
      <path d="M12 3.2v6"/><path d="M9.1 6.6 12 9.5l2.9-2.9"/>
      <path d="M3.8 14.8c1.9-2 3.8-2 5.6 0s3.8 2 5.6 0 3.3-1.8 5.2-.5"/>
      <path d="M3.8 19.4c1.9-2 3.8-2 5.6 0s3.8 2 5.6 0 3.3-1.8 5.2-.5"/>
    </g>`,
  // Crossing route arrows (Traffic Flow filter).
  traffic: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3.8 7h4c4.4 0 6.2 10 10.4 10"/>
      <path d="M3.8 17h4c4.4 0 6.2-10 10.4-10"/>
      <path d="m16.4 4.6 2.9 2.4-2.9 2.4"/>
      <path d="m16.4 14.6 2.9 2.4-2.9 2.4"/>
    </g>`,
  // Lightning bolt (Brush Mode chip).
  bolt: `<path fill="currentColor" d="M13.6 2.2 5.4 13.2h4.9l-1.9 8.6 8.2-11h-4.9l1.9-8.6Z"/>`,
};

const parser = new DOMParser();

/** An inline SVG icon tinted via `color` (defaults to inherit/currentColor).
 *  The markup comes exclusively from the static PATHS literals above (typed
 *  keys, no user input) and is parsed inert via DOMParser before adoption. */
export function gwIcon(name: GwIconName, size = 16, color?: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "gw-ic";
  span.style.display = "inline-grid";
  span.style.placeItems = "center";
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.flex = "0 0 auto";
  if (color) span.style.color = color;
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`,
    "image/svg+xml",
  );
  const svg = doc.documentElement;
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  (svg as unknown as HTMLElement).style.display = "block";
  span.append(document.importNode(svg, true));
  return span;
}
