// The DECLARATION the census derives from — identical in shape to the live
// contract, so the derivation cannot be satisfied by a fixture idiom the tree
// migrated away from (the C7 rot). The literal type positions here are MATCHES
// and are never counted as constructions.
import type { EffectBase } from "@adr/spine/pure/effect";

export interface PageOncall extends EffectBase {
  readonly kind: "PageOncall";
  readonly effectClass: "Irreversible";
  readonly ticket: string;
}
