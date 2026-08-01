# CHANGELOG

The preamble a release author actually reads, describing every obligation but one.
It names the migration heading and it names `release.ts`; it says nothing about the
teachability heading and nothing about the second machine that reads this file. An
entry authored strictly from this document is therefore red on a rule stated nowhere
its author looked — which is the failure this case exists to make impossible, and it
is the same failure the ritual document's own hook was built to prevent.

**Reading an entry.** Each heading is a marker value, and the note under
`**Migrating to it:**` says what a copy at the previous value must do.

**Reading the numbering.** It is contiguous and ordinal.
`examples/typescript/test/laws/release.ts` reads the live marker files and this file
together and goes red on either failure.

## spine-2

The second marked revision.

**Teachability:** measured across both fixture blocks in both ports. The contract is
*not* yet sufficient in either.

- TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view`
- Kotlin 4/8 — inferred: `register`

**Migrating to it:** nothing to do.

## spine-1

The first marked revision.

**Teachability:** the census at this release read TypeScript 0/6 and Kotlin 2/4.

**Migrating to it:** nothing to do.
