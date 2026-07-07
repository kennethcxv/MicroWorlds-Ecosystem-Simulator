/**
 * SUBSTRATE SELECTION — the pure arm/apply state behind the Terrain drawer's
 * Materials row. One instance lives in the app while the drawer is open.
 * Selecting NEVER touches the world — the Paint brush does the applying:
 *
 *   · click an UNLOCKED swatch  → ARMED (previewId) — the Paint brush will lay it
 *   · click the APPLIED swatch  → disarm (nothing to paint)
 *   · click a LOCKED swatch     → inspect only (info line explains the lock)
 *   · apply()                   → the Paint stroke commits the armed material
 *
 * (`previewId` is the historical field name for the ARMED material.)
 * No DOM/Three imports — unit-tested in tests/substrate.test.ts.
 */

export type SubstrateSelectAction = "preview" | "applied" | "locked";

export class SubstrateSelection {
  private applied: string;
  private preview: string | null = null;
  private inspected: string;

  constructor(appliedId: string) {
    this.applied = appliedId;
    this.inspected = appliedId;
  }

  /** The substrate committed to the layout (what the save holds). */
  get appliedId(): string {
    return this.applied;
  }

  /** The uncommitted substrate the sand currently shows, if any. */
  get previewId(): string | null {
    return this.preview;
  }

  /** What the info card describes (any card, locked ones included). */
  get inspectedId(): string {
    return this.inspected;
  }

  /** Is an uncommitted preview live on the sand? */
  get dirty(): boolean {
    return this.preview !== null;
  }

  /** A swatch was clicked. Returns what the click meant so the caller can
   *  re-skin the sand ("preview"), restore it ("applied") or explain the
   *  lock ("locked"). */
  select(id: string, unlocked: boolean): SubstrateSelectAction {
    this.inspected = id;
    if (!unlocked) {
      this.preview = null; // the world never previews a locked substrate
      return "locked";
    }
    if (id === this.applied) {
      this.preview = null;
      return "applied";
    }
    this.preview = id;
    return "preview";
  }

  /** Commit the live preview. Returns the newly applied id, or null if
   *  nothing was previewing. */
  apply(): string | null {
    if (!this.preview) return null;
    this.applied = this.preview;
    this.preview = null;
    this.inspected = this.applied;
    return this.applied;
  }

  /** Drop any preview + inspection back to the applied substrate. Returns the
   *  applied id (what the sand should show again). */
  revert(): string {
    this.preview = null;
    this.inspected = this.applied;
    return this.applied;
  }
}
