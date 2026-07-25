// ── spine/pure/command — the sealed ROOT of the signed record (L3, A1) ──────
// The base declares the three properties every Command carries, ONCE:
//
//   tool  the verb — the SAME name as its ToolResult (D3)
//   sig   by: Actor + authority: Authority — stamped ONLY at the boundary (G1)
//   id    minted ONLY at the boundary, from the committed sequence (G9)
//
// ONE FLAT HIERARCHY. There is no `Command.Surface.*` / `Command.Domain.*`
// split, because a split would re-create a type-level place to hang a second
// tool mechanic — which is exactly the 6.8 carve-out A1 deletes. A presentation
// verb (`focusTicket`, `setPanel`) is a peer of `setPriority` BY CONSTRUCTION:
// there is no type to branch on, so there cannot be two mechanics.
//
// Note that variants declare `sig`, not `by: Actor` — which is why a block
// never has to name `Actor` to contribute a Command (check C4 holds with no
// exception for Command). `actorOf(cmd)` is the read path.

import type { Actor, Signature } from "./actor";
import type { CommandId, ToolName } from "./ids";
import type { ResultOutcome } from "./tool-result";

export interface CommandBase {
  readonly outcome: ResultOutcome;
  readonly tool: ToolName;
  readonly sig: Signature;
  readonly id: CommandId;
}

/** A refusal is a decision — 5.4's discriminator ("does a human need to ask who
 *  did this, and when?") answers yes — so the spine's two cases are signed too. */
export interface UnhandledCommand extends CommandBase {
  readonly outcome: "unhandled";
  readonly note: string;
}

export interface RefusedCommand extends CommandBase {
  readonly outcome: "refused";
  readonly reason: string;
}

export type SpineCommand = UnhandledCommand | RefusedCommand;

export function actorOf(command: CommandBase): Actor {
  return command.sig.by;
}
