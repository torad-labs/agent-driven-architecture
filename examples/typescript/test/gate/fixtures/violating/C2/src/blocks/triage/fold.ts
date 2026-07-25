// VIOLATION: a block may not reach into a sibling; blocks talk through State.
import { statusOf } from "../escalation/slice";
export const peek = statusOf;
