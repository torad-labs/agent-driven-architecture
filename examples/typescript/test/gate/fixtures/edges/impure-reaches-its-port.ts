// THE CONTROL for the purity edge, and it carries the same weight as the
// published-entry control next door: without it the refusal is satisfied by any
// compiler failure at all. The leaf's ONE legal reach out of itself is its own
// block — the edge its manifest declares and its `tsconfig` references — so the
// port it implements has to resolve. A relative reach into a REFERENCED project
// is redirected to that project's declarations, which is the same mechanism the
// composition root uses to reach this leaf.
import type { OncallPort } from "../port";

export type TheBlocksOwnPort = OncallPort;
