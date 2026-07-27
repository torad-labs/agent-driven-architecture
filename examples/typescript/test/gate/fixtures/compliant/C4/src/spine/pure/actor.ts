// ALLOW-TEST C4, fourth half — THE DECLARING FILE's legal shape: the class
// declaration itself (the one legitimate value binding of the name) plus the
// type-only surface the tree actually uses. Proves the declaration-form
// denials key on REPUBLICATION, never on declaring or typing.
export class Signature {
  constructor(
    readonly by: string,
    readonly authority: string,
  ) {}
}

export type Stamped = { readonly sig: Signature };

export function describeStamp(sig: Signature): string {
  return `${sig.by}:${sig.authority}`;
}
