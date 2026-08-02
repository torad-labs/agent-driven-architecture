# CHANGELOG

The architecture's release log. **Entries key on the spine version marker**, never on a
date and never on a review identifier, because the marker is the only thing a vendored
copy can read off its own disk to answer "which template am I holding?". Every `##`
heading in this file is a marker value, and nothing else is — a heading that is not one
fails the build.

The marker is declared once per port, inside the vendored tier so that `cp -r` carries it:

| port | marker file | spelling |
|---|---|---|
| TypeScript | `examples/typescript/src/spine/pure/version.ts` | `export const SPINE_VERSION` |
| Kotlin | `examples/kotlin/spine/src/main/kotlin/adr/spine/pure/Version.kt` | `const val SPINE_VERSION` |

Both ports carry the **same** value: one architecture revision, two spellings.

**It is not the reducer version and it is not the envelope schema version.** Those two
live at `src/app/wire.ts` (app-owned, tags a snapshot with the fold that derived it,
§14.1) and `src/spine/pure/step-record.ts` (spine-owned, says which shape a committed
record is in, §14.7). A fourth identifier, the prompt version, is also app-owned and is a
captured audit fixture rather than a compatibility number (§14.7). Four questions, four
answers; merging any of the first three is exactly what this file exists to make
unnecessary.

**Reading an entry.** Each heading is a marker value. An entry says what changed *and*
what a copy sitting at the previous value must do to move up — that migration note is the
entry's reason to exist, not a courtesy, and it is written under the literal heading
`**Migrating to it:**` so that a check can read it. A change needing no adopter action
says so in those words rather than leaving the reader to infer it.

**Writing an entry: the second required heading.** Every entry also carries
`**Teachability:**`, and the newest one carries it about *this* tree. The release ritual
runs a census over both ports' block facades; the finding goes here, in that census's own
numbers and with the verdict those numbers support. The numbers are then read back off the
live tree, so an entry cannot claim a better tree, or a better reading of it, than the tree
supports — which is the whole reason the obligation is a heading rather than a habit. Older
entries keep the finding they recorded at their own release and are never re-measured.

**Reading the numbering.** It is contiguous and ordinal: `spine-4` means four entries have
ever been written. A number cannot be skipped to imply history nobody wrote, and the
marker cannot move without an entry — `examples/typescript/test/laws/release.ts` reads the
live marker files and this file together and goes red on either failure. It is not the
only machine that reads this file: `examples/typescript/test/laws/teachability.ts` reads
the paragraph above against the census it just took, and reads this preamble against itself
so that the obligation cannot be enforced in a place its author never looked.

**Getting a fix.** Patch propagation is the adopter's own. This repository publishes no
package, so nothing reaches a vendored copy except an author reading this file and
applying the diff (§1.3). Each release is preceded by the review ritual in
`RELEASE-RITUAL.md`, which is what an entry here is a receipt for.

## spine-1

The first marked revision of the vendored spine. Everything before it was unmarked, so
this entry is the baseline the next one is read against rather than a description of
change.

What the tier holds at this marker: the signed command bus and its fold driver, the one
impure boundary, the ports, the replay and snapshot path with its record envelope, the
barge-in mailbox and its consumer, the tier relay's read side, and the surface controller.
Each port's own gate pins its spine roster exactly, so a file added to or removed from
the tier is a diff rather than a surprise, and the next entry can describe a real
difference instead of a remembered one.

**Teachability:** the first recorded run of G13's governing test as a census, measured
across all six blocks in both ports by `examples/typescript/test/laws/teachability.ts`. It
counts the members each block's one public symbol publishes against the members some
declared contract requires, and names what is left over. The honest finding is that a
block's contract is *not* yet sufficient in either port:

- TypeScript 0/50 — inferred: `arm`, `contextLines`, `emptySlice`, `name`, `owns`,
  `register`, `view`
- Kotlin 12/33 — inferred: `register`

"Inferred" is the list of roles every block of that port publishes and no declared contract
requires — precisely what a fresh author would have to learn by opening a sibling's
registration file, which is verbatim the failure the test names. Kotlin's block contract
pins `arm` and `view` on all six blocks, leaving one inferred role; TypeScript declares no
block-facade contract at all, so its entire shape is inferred. Closing that is a change to
the TypeScript spine's own published surface and is not folded in here.

Read the Kotlin half beside the older census in `adr.spine.pure.Block`'s own header, which
counts the same six blocks and reports `register` at 5/6 where this one reports it on 6/6:
that census counts by ROLE and ANALYSIS declares three registrations, this one counts by
NAME and sees one per block. Two readings of one tree, neither wrong, and not
interchangeable — the older one is why the interface pins two roles rather than four.

This entry records the measurement. The check beside it refuses a later entry that states a
better number, or a better verdict, than the tree supports.

**Migrating to it:** nothing to do. A copy taken before the marker existed *is* a copy at
this revision. Add the marker file to your vendored tier so the next entry can mean
something to your build, and you are current.
