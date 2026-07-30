// VIOLATION: a block may not reach into a sibling; blocks talk through State.
import { statusOf } from "../escalation/slice";
// VIOLATION, the route the workspace wall leaves open: the sibling is linked
// into the root node_modules and its published entry resolves clean, so this
// spelling is denied by the rule and by nothing else.
import * as sibling from "@adr/block-escalation/register";
export const peek = statusOf;
export type Sibling = typeof sibling;
