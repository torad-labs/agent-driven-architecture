// THE VIOLATING HALF of the purity edge, driven by test/laws/edges.test.ts. The
// harness copies this file into a block's PURE unit and builds the wall. The
// specifier names that same block's own adapter — the one file in the folder
// permitted to hold a client — and the pure unit neither lists the `adapter/`
// folder nor references the project that does, so the reach is a RESOLUTION
// error rather than a lint message.
//
// It is the shape §7.8 says the architecture holds by the unit split
// instead of by a rule reading file names, and before the split it compiled,
// linted and formatted clean.
import { livePager } from "./adapter/adapter";

export const reachedItsOwnImpureUnit = typeof livePager;
