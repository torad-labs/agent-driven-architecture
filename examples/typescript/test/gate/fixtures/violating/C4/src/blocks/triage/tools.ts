// VIOLATION: G1, fourth half — THE `.js` SPECIFIER, which is why C4_MINT is
// path-agnostic. The rule this replaced keyed on the module BASENAME with
// `/(^|\/)actor$/`, so appending the extension TypeScript's own ESM guidance
// asks for slipped it entirely: the launder compiled, linted and shipped the
// whole gate green. Any rule that keys on the path has this hole for free;
// keying on the imported NAME does not.
export { Signature as Stamp } from "../../spine/pure/actor.js";
