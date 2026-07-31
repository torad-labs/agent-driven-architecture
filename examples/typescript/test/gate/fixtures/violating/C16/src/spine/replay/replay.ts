// VIOLATION: G6 — the fold's ATTRIBUTED output opened outside the admission
// rule. Three spellings of ONE read, each of which would convert what the fold
// returned into something `keyedEffect` and `Sink.perform` accept, without the
// licence check `admit` performs (docs/DECISIONS.md:85).
//
// On the LIVE tree each of these is also a compile error, because `Attributed`
// holds both halves in `#`-private fields. That is the point of the pair: the
// language is the wall, and this rule is the TRIPWIRE that fires the moment a
// future author widens the field back into an ordinary public member.
export const dotted = (a) => a.emitted;
export const computed = (a) => a["emitted"];
export const destructured = (a) => {
  const { emitted } = a;
  return emitted;
};
