// ── spine/surface/controller — ONE value out, ONE action sink in (G8, I6) ──
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

import type { Action, FinishedStep } from "../boundary/action";
import type { ViewModel } from "../pure/view";

export interface BoundarySeam<S> {
  readonly state: S;
  onStepFinish(step: FinishedStep): number;
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
    this.boundary.onStepFinish({ by: "Human", staged: [], actions: [action] });
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
