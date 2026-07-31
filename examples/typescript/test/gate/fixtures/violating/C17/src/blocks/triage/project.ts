// VIOLATION 2 of 4 — THE ALIASED IMPORT. A name-keyed selector frozen on
// `PageOncall` cannot follow `as Wake`; the census resolves the local name from
// THIS FILE'S OWN import list, so the alias is what it matches.
import type { PageOncall as Wake } from "../escalation/contract";

export const forge = (raw: unknown): Wake => raw as unknown as Wake;
