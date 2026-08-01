# CHANGELOG

A two-entry log whose newest entry records a teachability finding in the census's
own numbers. The older entry keeps a finding too — that is what proves the ritual
ran at its release — but its numbers are its own and are never re-measured.

**Writing an entry.** Every entry carries `**Migrating to it:**` and
`**Teachability:**`. The newest one's finding is measured against the live tree by
`examples/typescript/test/laws/teachability.ts`, so it cannot claim a better tree,
or a better reading of it, than the tree supports.

## spine-2

The second marked revision.

**Teachability:** measured across both fixture blocks in both ports. The contract is
*not* yet sufficient in either.

- TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view`
- Kotlin 4/8 — inferred: `register`

Kotlin pins `arm` and `view` through its declared block contract and leaves
`register` to be inferred; TypeScript declares no contract at all.

**Migrating to it:** nothing to do.

## spine-1

The first marked revision.

**Teachability:** the census at this release read TypeScript 0/6 and Kotlin 2/4.
Those are the numbers of the tree that shipped it and they stay that way.

**Migrating to it:** nothing to do.
