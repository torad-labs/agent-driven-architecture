// VIOLATION 4 of 4 — THE SHORTHAND BINDING. The discriminant is bound to a
// variable first, so no object-literal property in this file spells it; the
// string literal is still there, and that is what is denied.
const kind = "PageOncall";
const effectClass = "Irreversible";

export const laundered = { kind, at: 7, effectClass, ticket: "9999" };
