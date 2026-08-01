// ── spine/surface/controller — ONE value out, ONE action sink in (G8) ──
// The entire public surface of the application, for any UI: one immutable
// ViewModel and one `onAction`. Nothing else is exported, so a view cannot
// reach past it into State, into the fold, or into a tool.
//
// The human path is the SAME path as the agent's: an Action goes to the
// boundary, the boundary resolves it through the one name→ToolResult map, and
// the committed record differs only in `sig`. That is 3.2 made true.
//
// Note what this file does NOT import: the `Boundary` class. §1.3 lets the
// surface see `spine/boundary/action` (for `Action`) and nothing else, so the
// seam it needs is declared here, structurally, in three lines.
//
// Nor does it import `Actor` any more. It used to write `by: "Human"` into the
// step, and a surface that can write one of those three strings can write the
// other two — which is precisely what §5.3 says it cannot. The Actor rides the
// CHANNEL now, so the strongest thing this file can say is "a human did it", and
// it says it by HOLDING the human channel rather than by claiming so in a payload
// the boundary would have believed.

import type { Action, StepChannel } from "../boundary/action";
import type { ViewModel } from "../pure/view";

/** ONE CHANNEL, AND IT IS THE HUMAN ONE. The seam names `human` and nothing else,
 *  so this file cannot spell a step stamped `Agent` or `Spine` even though the
 *  object handed to it at wiring is the whole Boundary. The type is the
 *  confinement and `tsc` is what holds it — no rule involved. */
export interface BoundarySeam<S> {
  readonly state: S;
  readonly human: StepChannel;
}

export class Controller<S, V extends ViewModel> {
  private listeners: readonly ((view: V) => void)[] = [];

  constructor(
    private readonly boundary: BoundarySeam<S>,
    private readonly project: (state: S) => V,
  ) {}

  get view(): V {
    return this.project(this.boundary.state);
  }

  /** the ONE sink — a tap, a drag, a form submit, all arrive here */
  onAction(action: Action): void {
    this.boundary.human.submit({ staged: [], actions: [action] });
    const view = this.view;
    this.listeners.forEach((listen) => listen(view));
  }

  subscribe(listen: (view: V) => void): () => void {
    this.listeners = [...this.listeners, listen];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listen);
    };
  }
}
