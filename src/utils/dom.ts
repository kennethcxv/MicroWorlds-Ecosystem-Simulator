/** Tiny DOM helpers so UI modules avoid repetitive boilerplate. */

type ElAttrs = {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
  title?: string;
  dataset?: Record<string, string>;
  attrs?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElAttrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.html != null) node.innerHTML = opts.html;
  if (opts.title) node.title = opts.title;
  if (opts.dataset) for (const k in opts.dataset) node.dataset[k] = opts.dataset[k];
  if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
  if (opts.onClick) node.addEventListener("click", opts.onClick as EventListener);
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}

/** Format an integer with thousands separators, e.g. 12540 -> "12,540". */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatSigned(n: number): string {
  const r = Math.round(n);
  return (r >= 0 ? "+" : "") + r.toLocaleString("en-US");
}
