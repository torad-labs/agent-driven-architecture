// THE NEGATIVE WITNESS, kept as a permanent wall rather than a footnote in a
// review. A foreign schema library is hoisted to the ONE root store, and no
// block manifest declares it — yet a block file naming it compiles. So the
// foreign-import law has no build edge on this port, whatever the module graph
// does for project-to-project edges, and under the floor rule it may not print
// the configuration-time rung.
//
// If a later landing DOES draw that edge, this fixture stops compiling and the
// test driving it goes red — which forces the law's rung to be re-earned rather
// than left stale. That is the whole reason it is checked in.
import * as v from "valibot";

export const aForeignSchema = v.string();
