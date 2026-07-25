// VIOLATION: the spine tier must be liftable out whole. A spine file that names
// a block — or the composition root — is a spine you can no longer vendor
// without dragging someone's feature code along with it.
import type { TriageSlice } from "../../blocks/triage/slice";
import type { State } from "../../app/contract";
export type Held = TriageSlice;
export type Root = State;
