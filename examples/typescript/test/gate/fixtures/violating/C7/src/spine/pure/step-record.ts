// VIOLATION: G1, the SEAL's FORM half — authored INSIDE a bucket the mint is
// exempted for, which is the only place a value binding of the mint can exist.
//
// EVERY IMPORT HERE IS RENAMED, and that is the point of the file rather than a
// flourish. `C7_LAUNDER` keys on the names `seal` and `TransportSeal`; under
// `__s` and `__TS` it sees nothing, and MEASURED, every name-keyed remedy
// proposed for this hole passed a fixture written with the plain names. A pair
// that a name-keyed rule survives proves nothing, so the pair is written the
// way the evasion is: the FORM is what has to be denied.
import { seal as __s, TransportSeal as __TS } from "./result";

// 1  the const REBINDING — one keystroke from the specifier form below
export const mint = __s;

// 2  the SPECIFIER, renamed on the way in so `local.name` is not the mint's
export { __s };

// 3  the DEFAULT, the one name no import denial downstream can key on
export default __s;

// 4  the SUBCLASS — no mint named at all, and yet every instance carries
//    `#sealed`, because a private field is installed by the super constructor
export class Forger extends __TS {}

// 5  the same subclass as a class EXPRESSION, which is not a ClassDeclaration
//    and which a selector keyed on the declaration form walks straight past
export const Forger2 = class extends __TS {};

// 6  the LIVE BINDING — `const` and a literal initializer are what the shape
//    rule admits, so a reassignable export is the way past a literal check
export let hole: unknown = 1;
hole = __s;
