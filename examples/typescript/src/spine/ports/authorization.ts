// ── spine/ports/authorization — the PRODUCT-OWNED seam (14.3, G6) ──────────
// INTERFACES ONLY (C11).
//
// This is where the book already routes actor-keyed checks, and it is where
// G6's unattended confirmer becomes reachable. `authorityOf` answers "under
// whose permission is this stream acting right now" — a policy tier, a
// second-agent reviewer, a deferred approval queue and a human host are all
// just different Authority ids, so no product-owned confirmer ever adds an Actor
// variant — the actor contract grows at architecture revision, never per app.
//
// G6's per-tenant budget has the same home: a folded budget bounds only
// aggregates within the unit of work its stream is scoped to, so anything
// spanning k concurrent sessions is enforced HERE, before the fold, with its
// verdict captured on the committed record like any other decision.

import type { Actor, Authority, Signature } from "../pure/actor";
import type { SessionId } from "../pure/ids";
import type { ToolResultBase } from "../pure/tool-result";

export interface AuthorityResolver {
  authorityOf(by: Actor, session: SessionId): Authority;
}

export interface ConfirmPolicy<S> {
  mayConfirm(sig: Signature, result: ToolResultBase, state: S): boolean;
}

export interface Authorization<S> extends AuthorityResolver, ConfirmPolicy<S> {}
