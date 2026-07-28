// A DELIBERATELY BROKEN corpus. Input to the reference lint's block-test, never
// part of the build — tsconfig and biome both exclude this tree, exactly as they
// exclude test/gate/fixtures.
//
// F9 measured the per-item failure, A4 measured the vendorable spine, and L3
// measured the closed match. D4 is the worst of them: the same spelling names an
// entry in the ratified record that has nothing to do with this file.
//
// PACKAGE NOTE (§1.5): a section the book does not have.
// The edit list is 8.6 — a bare phantom, on a comment line the lint reads.
// See 99.9 for the head that sits outside the book's own range.
// G17 is a law the registry does not carry.
export const roster = [{ id: "C4", invariant: "the rule lives at 8.6, in a value" }];
