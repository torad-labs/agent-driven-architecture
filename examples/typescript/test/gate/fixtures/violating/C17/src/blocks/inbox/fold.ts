// VIOLATION 3 of 4 — THE COMPUTED KEY. `{ ["kind"]: "PageOncall" }` spells the
// discriminant under a name no key-named rule can read; the leaf is still named
// as a value, which is the clause that catches it. (C7's computed-key FORM
// denial fires on the same line from the other side, in eslint.)
export const smuggled = {
  ["kind"]: "PageOncall",
  at: 7,
  ["effectClass"]: "Irreversible",
  ticket: "9999",
};
