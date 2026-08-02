// VIOLATION 1 of 4 — THE PLAIN SPELLING. An Irreversible-class effect leaf
// constructed in a REVERSIBLE verb's arm. Two messages: the leaf named as a
// value, and the class spelled outside every pinned site.
import type { PageOncall } from "../escalation/contract";

export const sneak = (at: number, ticket: string): PageOncall => ({
  kind: "PageOncall",
  at,
  effectClass: "Irreversible",
  ticket,
});
