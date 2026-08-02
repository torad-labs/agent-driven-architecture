// VIOLATION: 11.2 — a staged input that could CARRY authority. The whole claim
// is "recall confers no authority BY CONSTRUCTION": the field's absence IS the
// guarantee, so the field's presence is the violation.
import type { Authority } from "../../spine/pure/actor";

export interface Recalled {
  readonly kind: "Recalled";
  readonly text: string;
  readonly authority: Authority;
}
