// COMPLIANT: the attributed list is handed WHOLE to the admission rule, and what
// this file names is the value `admit` handed back.
//
// CONSTRUCTING an attribution stays legal wherever the fold runs — the fold is
// the only place holding both halves — and so does PROSE: this very comment says
// that an arm emitted an effect, and a rule that fired on it would be the
// nuisance 15.2 warns about. Only a member READ is denied.
export const derive = (admit, licences, produced) => admit(licences, produced);
export const attribute = (from, emitted) => ({ from, emitted });
export const named = (from, emitted, make) => make({ from: from, emitted: emitted });
