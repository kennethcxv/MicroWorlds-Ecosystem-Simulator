/**
 * Inline SVG line-icons used across the UI. Stroke-based, 24x24, currentColor —
 * so they inherit text colour and stay crisp at any size. `icon(name)` returns
 * an SVG string for innerHTML.
 */

const P = (paths: string, opts: { fill?: boolean } = {}) =>
  `<svg viewBox="0 0 24 24" fill="${opts.fill ? "currentColor" : "none"}" stroke="${
    opts.fill ? "none" : "currentColor"
  }" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS: Record<string, string> = {
  leaf: P(
    '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 8-4 12-9 12Z"/><path d="M4 20c2-5 6-8 11-9"/>',
  ),
  droplet: P('<path d="M12 3.5C8 8 6 10.8 6 14a6 6 0 0 0 12 0c0-3.2-2-6-6-10.5Z"/>'),
  dropletRefresh: P(
    '<path d="M12 3.8C8.6 7.8 7 10.3 7 13a5 5 0 0 0 9.5 2.2"/><path d="M17 11.5V8m0 3.5h-3.4"/>',
  ),
  star: P('<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.7 1.1-6L3.4 9.5l6-.8Z"/>', {
    fill: true,
  }),
  sun: P(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  ),
  menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  thermometer: P(
    '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
  ),
  flask: P('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>'),
  molecule: P(
    '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="9" r="2.2"/><circle cx="11" cy="17" r="2.2"/><path d="M8 8.2l8 .6M16.6 11l-4 4M9.2 15.2 7 9"/>',
  ),
  habitat: P(
    '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6Z"/><path d="M12 8c-2 1.6-3 3-3 5a3 3 0 0 0 6 0c0-2-1-3.4-3-5Z"/>',
  ),
  fish: P(
    '<path d="M3 12c3-5 9-6 13-4 3 1.5 5 4 5 4s-2 2.5-5 4c-4 2-10 1-13-4Z"/><path d="M3 12c-1 1.5-1 3.5 0 5 1-1 1.5-2.4 1.5-2.4M16.5 10.2h.01"/>',
  ),
  fishPlus: P(
    '<path d="M2.5 12c2.6-4.2 7.4-5 10.5-3.6M2.5 12c-.8 1.3-.8 3 0 4.2 .8-.8 1.2-2 1.2-2"/><path d="M18 5v6M21 8h-6"/><path d="M11 15c2 1 4.5 1 7-1"/>',
  ),
  sponge: P(
    '<rect x="4" y="9" width="16" height="10" rx="3"/><path d="M4 12c2.5 1 13.5 1 16 0M8 9c0-2.5 8-2.5 8 0"/>',
  ),
  plant: P(
    '<path d="M12 21V9"/><path d="M12 13c-3 0-5-2-5-6 3 0 5 2 5 6Z"/><path d="M12 11c3 0 5-2 5-6-3 0-5 2-5 6Z"/>',
  ),
  shop: P(
    '<path d="M4 8.5 5.2 5h13.6L20 8.5M4 8.5h16M4 8.5c0 1.8 1 2.8 2.3 2.8S8.6 10.3 8.6 8.5c0 1.8 1 2.8 2.3 2.8s2.3-1 2.3-2.8c0 1.8 1 2.8 2.3 2.8s2.2-1 2.2-2.8"/><path d="M5.5 11.2V19h13v-7.8"/>',
  ),
  inventory: P(
    '<path d="M4 7h16v12H4z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/><path d="M4 12h16"/>',
  ),
  guide: P('<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z"/><path d="M18 18H7a2 2 0 0 0-2 2"/><path d="M9 8h6M9 11h6"/>'),
  journal: P(
    '<path d="M12 6c-2-1.4-4.5-2-8-2v15c3.5 0 6 .6 8 2 2-1.4 4.5-2 8-2V4c-3.5 0-6 .6-8 2Z"/><path d="M12 6v15"/>',
  ),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  schedule: P(
    '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4M9 14h2M14 14h1M9 17h2"/>',
  ),
  notes: P(
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>',
  ),
  chevron: P('<path d="M9 6l6 6-6 6"/>'),
  pencil: P('<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M14 6l4 4"/>'),
  tankSize: P('<rect x="4" y="6" width="16" height="13" rx="1.5"/><path d="M4 9c4 1.5 12 1.5 16 0"/>'),
  filter: P('<path d="M6 4h12l-1 8H7Z"/><path d="M9 12v6a3 3 0 0 0 6 0v-6"/>'),
  bulb: P(
    '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9c.6.5.5 1.1.5 2.1h6c0-1 0-1.6.5-2.1A6 6 0 0 0 12 3Z"/>',
  ),
  decor: P('<path d="M4 20c2-1 3-3 3-6M20 20c-2-1-3-3-3-6"/><circle cx="12" cy="7" r="3"/><path d="M12 10v10"/>'),
  snail: P(
    '<path d="M3 18h11a5 5 0 1 0-5-5c0 2 1.5 3 3 3"/><path d="M14 18l3-2M19 11l1.5-1.5M19 13l1.8 0"/>',
  ),
  shrimp: P(
    '<path d="M20 8c-5 0-8 2-9 5-1 2.5-3 4-6 4 0-3 1.5-5 4-6 3-1.2 4-3 4-5"/><path d="M11 13c1.5 1.5 4 2 7 1"/>',
  ),
  wildlife: P('<path d="M5 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 12c-3 0-5 2-5 4.5S9 21 12 21s5-2 5-4.5S15 12 12 12Z"/>'),
};

export function icon(name: keyof typeof ICONS | string): string {
  return ICONS[name] ?? "";
}

export function iconEl(name: string, className = "icon"): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.innerHTML = icon(name);
  return span;
}
