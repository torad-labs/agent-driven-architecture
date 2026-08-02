// VIOLATION: the spine tier must be liftable out whole. A spine file that names
// a block — or the composition root — is a spine you can no longer vendor
// without dragging someone's feature code along with it.
import type { TriageSlice } from "../../blocks/triage/slice";
// VIOLATION by PACKAGE NAME — the spelling the wall does not deny, because a
// block's published entry resolves from anywhere in the workspace.
import type * as leaf from "@adr/block-triage/register";
import type { State } from "../../app/contract";
export type Held = TriageSlice;
export type Root = State;
export type Leaf = typeof leaf;
