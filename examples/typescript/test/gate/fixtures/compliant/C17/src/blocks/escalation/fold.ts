// COMPLIANT: the leaf at its OWN PINNED SITE — the arm of the Irreversible verb
// that earns it. This is the construction the roster in test/gate/c17.ts names,
// and it must pass untouched or the check is a rule nobody can satisfy.
import type { PageOncall } from "./contract";

export const page = (at: number, ticket: string): PageOncall => ({
  kind: "PageOncall",
  at,
  effectClass: "Irreversible",
  ticket,
});
