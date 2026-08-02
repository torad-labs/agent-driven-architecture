// THE CONTROL for the same edge, and it is load-bearing rather than decorative:
// without it, the refusal next door would be satisfied by ANY compiler failure —
// a broken copy, a missing type package, a bad config — and the probe would pass
// while measuring nothing. This names the one subpath a block publishes, which
// must still resolve. It is also the residue the edge cannot close: a package
// graph cannot show one entry to the composition root while hiding it from a
// sibling, so a denying check owns this direction.
import { triage } from "@adr/block-triage/register";

export const reachedThePublishedEntry = typeof triage;
