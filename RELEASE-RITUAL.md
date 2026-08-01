# The release ritual

One adversarial review stands between any change to the spine tier and a new entry in
`CHANGELOG.md`. This file describes the loop that produced the current tree — it is a
transcript of what was actually run, not a process invented for a document. Where a step
below reads as elaborate, it is because skipping it is what the review it replaced kept
catching.

## The precondition, and it is absolute

**If you cannot name the command that settles a dispute, stop and build that command
first.** Every step below assumes a mechanical oracle exists; without one the loop
produces confident prose and nothing else, because each participant is arguing rather
than measuring. The two oracles are:

```
cd examples/typescript && npm test
```

```
cd examples/kotlin && ./gradlew --console=plain test --rerun-tasks
```

`--rerun-tasks` is not decoration. A green Gradle run over up-to-date tasks proves that
nothing ran, and a cached green over an unmoved instrument has been mistaken for a landing
here before. The TypeScript command is one script by design: it runs the type check, the
workspace wall, both linters and the tests, so there is no second command a hurried author
can forget (§15.2).

## The loop, per unit of work

A "unit" is one decision or one defect — small enough that a reviewer can hold the whole
artifact in view, and large enough that landing it changes something a reader can name.

1. **Attack the premise before writing any code.** A separate reader takes the item and
   tries to falsify the item itself: does the thing it says is missing actually exist?
   Does the constraint it imposes trace to a ratified decision, or did the author invent
   it? Measure both the pinned scope and the largest defensible one. This reader writes no
   code, which is what keeps the audit honest — an auditor who is also the implementer
   audits toward the implementation they have already imagined. Items have died here, and
   items have come out of here larger than they went in.

2. **Implement once, against the live tree.** One author per unit. The tree is the truth,
   never a checkout of the last commit: a campaign lands artifacts between units, so the
   commit goes stale by design. The author runs both oracles on a private copy before
   handing anything over, and reports the exact tail output.

3. **Prove it can fail.** A check that has never gone red is a decoration. Break at least
   three different things the artifact claims and show each one going red. Any narrowing
   guard — an exclusion, an ignore, a skip-if-missing, an early return — is the first
   suspect, because that is where a check quietly stops matching the live idiom. A rule
   whose fixtures froze while the tree moved has shipped here, stayed green, and matched
   nothing.

4. **Review in split stances, artifact-only.** At least two readers assume the artifact is
   wrong and go looking; one reader assumes it is right and has to prove it. Each works in
   a separate context and sees the artifact rather than the author's reasoning about it.
   The stances are assigned, not chosen: a reviewer free to conclude either way converges
   on the author's framing, and the whole point is to have the framing attacked.

5. **Adjudicate mechanically.** Disagreements are settled by running an oracle, never by
   argument or seniority. Where the oracle is silent the dispute is a design question and
   goes to the owner — the loop does not pretend to decide those.

6. **Repair forward.** A finding routes back to a fixer, never to a bin. Three failed
   repair rounds on one unit is the point at which the unit is recorded as blocked and the
   campaign moves on; the block is a result, and an unrecorded one is how the same defect
   is rediscovered a month later.

7. **Land, then re-verify against the actual diff.** Green gates are necessary and not
   sufficient. Name, before landing, the instrument you expect to move and by how much,
   then read it afterwards. An unmoved instrument under a green gate is a false landing —
   and an instrument that was *predicted* not to move and did not is a real confirmation.
   Verification is predicted-versus-observed, never "it passed".

Those seven steps are not decoration either. The five practices they turn on — the
**premise** attack, the **split stances** panel, **Adjudicate mechanically**, **Repair
forward**, and **Prove it can fail** — are read out of this document by
`examples/typescript/test/laws/release.ts` and asserted as literals, because a ritual
whose steps can be deleted in silence is a ritual nobody runs. Rewriting a step is
ordinary; dropping the practice it names is a red build.

## What a release adds on top

A release is the moment `CHANGELOG.md` gains an entry and both ports' spine version marker
moves. Three extra obligations attach to it:

- **The teachability test is run here, not on a schedule.** The governing question is
  G13's: can a fresh author — human or agent — implement a block from its contract alone,
  without reading a sibling's source? Run it against a block the release touched. A
  periodic teachability review belongs to nobody and therefore happens never; attaching it
  to the release gives it an owner and a date (§17.2 is the checklist it exercises).

  The trial itself is human and stays human — nothing here pretends to automate it. What is
  measured for you is its PRECONDITION: `examples/typescript/test/laws/teachability.ts`
  reads every block's one public symbol in both ports, counts the members some declared
  contract requires against the members the block publishes, and names the members every
  block of a port publishes that no contract requires. That list is exactly what a fresh
  author would otherwise have to infer by opening a sibling, so it is the shortlist the
  human trial starts from.

  Write the run's finding into the new `CHANGELOG.md` entry under the literal heading
  `**Teachability:**`, in the census's own numbers and with the verdict those numbers
  support. The same check reads both back off the live tree, so a release cannot record a
  pass the tree does not support: soften the numbers and it is red, soften the reading and
  it is red. A finding that says the contract is *not* sufficient is a finding, not a
  failure — the metric's job is to be true, not to be zero, and softening it to get a green
  is the one move this step exists to make impossible.

- **The marker and the entry move together, and a check enforces it.** Bumping
  `SPINE_VERSION` in either port without writing the matching entry fails the build, as
  does an entry whose heading is not a marker value. That check is
  `examples/typescript/test/laws/release.ts`, wired into the TypeScript oracle above. It
  is a gated test and deliberately not a new architectural law: the invariant table is
  closed, and §16.4's bar for opening it — a named production failure — is not met by a
  bookkeeping rule.

- **The entry states the migration, because nothing else can.** No package is published,
  so an adopter's only route to a fix is reading the entry and applying the diff by hand
  (§1.3). An entry that describes a change without saying what a copy at the previous
  marker must do has not done its job, so the note is written under the literal heading
  `**Migrating to it:**` and the same check reads every entry's body for it. "Nothing to
  do" is a migration note; silence is not.

## What this ritual is not

It is not a substitute for the gate. Every invariant worth having is enforced by a check
with a violating and a compliant fixture, proven red and green, wired into the ordinary
build (§15.2) — the review exists to catch what no check can yet see, and its most
valuable output is a new check rather than a comment. It is also not a schedule: it runs
per release, and a release happens when there is something to migrate.
