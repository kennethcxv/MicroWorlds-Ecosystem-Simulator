/**
 * Sliced sprite deformation — the heart of the "real swimming" look.
 *
 * Instead of blitting a fish as one flat image, we redraw its (already
 * underwater-graded) stamp as a column of thin vertical slices. Each slice is
 * pushed along the fish's cross-axis by a sine wave that TRAVELS from head to
 * tail, so the body visibly flexes and the tail swishes. A separate static
 * `turnBend` curves the whole body during turns (so the head leads and the tail
 * trails). The head stays almost still; the tail moves the most.
 *
 * This module only knows how to draw a deformed stamp; the swim *motion* (where
 * the fish goes, how fast its tail beats) lives in the scene/agent code.
 */

export interface SliceDeform {
  /** Head is at the left edge of the (unflipped) sprite. */
  headLeft: boolean;
  /** Number of vertical slices (more = smoother curve, costlier). */
  slices: number;
  /** Peak tail swing, in stamp pixels. */
  amp: number;
  /** Current travelling-wave phase. */
  phase: number;
  /** Wave span across the body, in radians (a gentle C/S curve ≈ 2–3). */
  waveSpan: number;
  /** Static body curvature for turns, in stamp pixels (signed). */
  turnBend: number;
  /** Content box left edge within the stamp, in pixels. */
  contentX0: number;
  /** Content box width within the stamp, in pixels. */
  contentW: number;
}

/**
 * Draw `stamp` (a pre-graded sprite occupying the top-left SW×SH of the canvas)
 * into the current transform, deformed by a head→tail wave. The caller has
 * already applied translate/scale(face)/rotate(pitch); we draw at (-ax,-ay).
 */
export function drawSlicedStamp(
  ctx: CanvasRenderingContext2D,
  stamp: CanvasImageSource,
  SW: number,
  SH: number,
  ax: number,
  ay: number,
  d: SliceDeform,
): void {
  const n = Math.max(2, d.slices | 0);
  const sw = SW / n;
  const cw = d.contentW || SW;
  for (let i = 0; i < n; i++) {
    const sx = i * sw;
    // Normalized position of this slice across the content box (0..1, left→right).
    let p = (sx + sw / 2 - d.contentX0) / cw;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    // Distance from the head along the body (0 at head, 1 at tail).
    const fromHead = d.headLeft ? p : 1 - p;
    // Head stays still; weight ramps toward the tail.
    const w = fromHead <= 0.12 ? 0 : Math.pow((fromHead - 0.12) / 0.88, 1.5);
    const offset = (Math.sin(d.phase - fromHead * d.waveSpan) * d.amp + d.turnBend) * w;
    // +1px overlap so adjacent slices never reveal a seam.
    ctx.drawImage(stamp, sx, 0, sw + 1, SH, -ax + sx, -ay + offset, sw + 1, SH);
  }
}
