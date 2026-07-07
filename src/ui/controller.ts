/** Shared contract the UI components use to talk back to the app. */
import type { GameState, ScreenId, EventTone } from "../core/state";
import type { ActionId } from "../data/tanks";

export interface Controller {
  readonly state: GameState;
  dispatch(action: ActionId): void;
  navigate(screen: ScreenId): void;
  toast(message: string, tone: EventTone): void;
  saveNow(): void;
  resetGame(): void;
}

/** A mounted UI piece: its root node plus a pull-based refresh. */
export interface Component {
  el: HTMLElement;
  update(state: GameState): void;
}
