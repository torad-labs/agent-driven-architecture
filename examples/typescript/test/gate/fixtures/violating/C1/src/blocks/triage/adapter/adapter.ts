// VIOLATION: an adapter's licence to hold a client library is not a licence to
// hold the spine. Before the workspace wall, `spine/boundary` was reachable only
// by a relative path the allow-list did not list; once the spine became a
// package, a bare-anything allowance would have handed it over.
import * as seam from "@adr/spine/boundary/boundary";
export type Seam = typeof seam;
