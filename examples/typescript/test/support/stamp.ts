// -- test/support/stamp - the ONE place a test mints a Signature ------------
// A block's isolation test calls `arm(slice, result, at, sig)` directly, so it
// needs the stamp the boundary would otherwise have minted. Those tests now
// live INSIDE their block package, and `new Signature(...)` in a block folder
// would be a second production site in exactly the place C4 exists to keep
// clean - so the construction lives here, in the shared rig, which is where it
// already lived before the tests moved.
//
// This is not an exemption. The four calls it replaces were already in unlinted
// test files; what changed is WHERE, so that no file under `src/` binds the
// constructor outside `spine/boundary`.

import type { Actor, Authority } from "../../src/spine/pure/actor";
import { Signature } from "../../src/spine/pure/actor";

export const stamp = (by: Actor, principal: Authority): Signature => new Signature(by, principal);
