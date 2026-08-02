// The same declaration, in the compliant tree: a literal TYPE position is a
// match and stays legal everywhere.
import type { EffectBase } from "@adr/spine/pure/effect";

export interface PageOncall extends EffectBase {
  readonly kind: "PageOncall";
  readonly effectClass: "Irreversible";
  readonly ticket: string;
}
