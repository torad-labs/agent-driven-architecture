// THE VIOLATING HALF of the cross-block build edge, driven by test/laws/edges.test.ts.
// The harness copies this file INTO another block's package and runs the real
// compiler over it. The specifier names a sibling block's internals, and no
// block publishes that subpath — so the refusal is a RESOLUTION error and not a
// lint message: there is no module for the compiler to look inside.
import * as internals from "@adr/block-triage/fold";

export const reachedIntoASibling = typeof internals;
