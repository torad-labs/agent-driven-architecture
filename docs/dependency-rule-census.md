# The dependency-rule census

A work-note, not book content. It creates no G-id and no public authority id (D30): nothing in
this file may be cited from the book, the worked example, or either port. Its job is to hold the
measurement that D7 and D8 were graded on, so a later reader can re-run it rather than trust it.

**The authority is the test, not this file.** The walk below now lives as executable code in
`examples/typescript/test/laws/dependency-rule.test.ts`, pinned per file as an equality, so a new
competing wording of the rule in the census spelling family goes red in the gate; a wording outside that family is owned by review at the convergence sites. This note
keeps the walk as documentation of *how* the pool is derived and *why* a naive grep will not do.
Where the two disagree, the test is right and this note is stale.

Measured against the tree at the D7/D8 landing. The prior state is `f845991..788b790`.

---

## 1. The command

A plain grep does not measure this pool. The worked example writes `points <em>inward</em>`, and the
tag splits the phrase, so the candidate set is generated markup-aware, by stripping tags before
matching:

```python
# python3 census.py <root>
import os, re, sys
ROOT = sys.argv[1]
TAG  = re.compile(r'<[^>]+>')
PAT  = re.compile(r'(point\w*|leak\w*|reach\w*|depend\w*)\s*(<[^>]+>)?\s*(inward|in)\b', re.I)
SKIP = {'node_modules', '.git', 'build', '.gradle', '.claude', '.rules', '.github', 'dist', 'coverage'}
for dp, dns, fns in os.walk(ROOT):
    dns[:] = [d for d in dns if d not in SKIP]
    for fn in fns:
        if not re.search(r'\.(html|md|ts|kts|js|kt|toml|json)$', fn):
            continue
        p = os.path.join(dp, fn)
        for i, line in enumerate(open(p, encoding='utf-8').read().split('\n'), 1):
            if PAT.search(TAG.sub('', line)):
                print(f"{p}:{i}: {line.strip()}")
```

**Re-run block.** Every number in this section is produced by a command, and the command is written
beside it so a later reader can check rather than believe. Run each from the repository root.

| claim | command | result |
|---|---|---|
| the naive grep undercounts | `grep -rn --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.gradle 'points inward' . \| wc -l` | **9** |
| the pool, before this item | `git stash && python3 census.py .` (or check out `f845991`) | **44 lines / 18 files** |
| the pool, after this item, this note excluded | `python3 census.py . ` with `docs/dependency-rule-census.md` removed from the walk | **55 lines / 19 files** |
| the pool, after this item, raw | `python3 census.py .` | **66 lines / 20 files** |

The naive instrument reads **9**, against a real pool of **44** before the landing: the markup-aware
walk is needed by roughly five times, not by a rounding error. (Two near-neighbour spellings, for
completeness: `grep -rn 'point inward'` reads 23, and `grep -rniE 'point[a-z]*[^a-z]*inward'` reads
36. No reading of any grep yields the pool.)

**This file is excluded from its own pool** in the third row — it necessarily quotes the phrasings it
measures, so counting it would make the census a site in the census. Same exclusion, and same reason,
as the pin test's exclusion of its own directory (§7). Add `'dependency-rule-census.md'` to `SKIP`,
or subtract this file's matching lines from the raw run.

The pool did not move across `23816d4`, `deb9c2b`, `ff33aed`, `da78616`, `788b790` — only line
numbers did: the same walk returns 44 / 18 at `f845991` and on the live tree alike. The +11 lines /
+1 file after this item is enumerated file by file in §6, and every line of it is accounted for
there.

One number here disagrees with the premise audit that scoped this item: it pinned the superset at
44 lines / **17** files, and the walk above returns 44 / **18**. The line count matches exactly and
the file count does not. This is an audit miscount, not tree movement — there is no commit at which
the walk returns 17.

**The pattern admits exactly ONE homonym, and the census excludes it**:
`examples/kotlin/src/main/kotlin/adr/spine/ports/ModelProvider.kt:4` — "the runtime's types never
leak inward", which is type leakage, not import direction.

Two **near-misses** that a reader might expect in the pool and that the pattern never admits, listed
so nobody re-derives them as a discrepancy: §16.4's section head ("the discipline turns inward") and
its note label ("The discipline, turned inward"). Neither carries a `point|leak|reach|depend` token
before `inward`, so `PAT` does not match them. An earlier draft of this note claimed three admitted
homonyms and cited these two by line number; both claims were wrong, and the line numbers were stale
besides — which is why this section now cites sections and re-runnable commands rather than lines.

---

## 2. DECLARATION versus APPLICATION

Only **declaration** sites — those stating the general rule — take the canonical sentence. An
**application** site applies the rule to one named seam and keeps that seam's own words; forcing
one sentence into them would destroy the per-seam prose D7 never asked to touch. The distinction is
now stated in the book itself, in the `THE RULE, IN ONE LINE` note.

All seven per-seam `Direction` slots — one on each of `wiki/example/01`…`07` (verified:
`grep -c '<div class="k">Direction</div>' wiki/example/0*.html` returns 1 for each) — plus the other
applications are explicitly OUT of the verbatim requirement. They are not invisible, though: every
one of those files sits in the pinned pool (§7), so a change to any of them is a red diff even though
its wording is free.

---

## 3. The declaration sites, and where each ended up

`CANON` = carries the canonical sentence verbatim. `NAMED` = names the rule and points at the
canon without restating it. `HELD` = deliberately not unified, reason given.

| site | before | after |
|---|---|---|
| `wiki/index.html` §7.6 note (`id="the-dependency-rule"`) | the canon already | **CANON** — the home |
| `wiki/index.html` §7.6 lead-in | a second, different full wording | **NAMED** |
| `wiki/index.html` §15.3 G10 row | a third, different full wording | **CANON** |
| `wiki/example/index.html` §01 "The law, in one sentence" | a fourth ("purity points inward") | **CANON**, then its purity consequence |
| `examples/kotlin/README.md` tree caption | a fifth (trunk/leaves/root) | **CANON**, then the trunk/leaves gloss as a derived variant |
| `examples/typescript/README.md` tree caption | a sixth (trunk/leaves/root) | **CANON**, then the same gloss |
| `examples/kotlin/.../gate/Rules.kt` C1 banner | a seventh | **CANON** |
| `examples/typescript/eslint.config.js` C1 banner | named §1.3's table only | **CANON** |
| `wiki/index.html` Fig 7.2 figcaption | describes the figure's edges | **HELD** — an application to one figure |
| `wiki/index.html` §15.4 checklist item | poses the rule as a question | **HELD** — an application, in the checklist's voice |
| `wiki/index.html` §17.6 "a seam to the outside" row | short label | **HELD** — a table cell, not a statement |
| `wiki/example/index.html` §01 lede | Clean Architecture, quoted | **HELD** — an attributed quotation; rewording it would misquote |
| the `C1` check label (4 sites) | "dependencies point inward" | **HELD** — a gate identifier bound to both rosters, `GateTest.kt` and `eslint.config.js` |
| `README.md` (repo root) | trunk/leaves/root, zero pool hits | **HELD** — repo-facts about this repository's tree, not the general rule (D32 leaves the README repo-facts) |
| `docs/adr/ADR-001:147`, `:298` | short label; ring vocabulary | **HELD** — see §5 |

**What moved, stated as something checkable.** "Thirteen distinct wordings" is the premise audit's
count, and it rests on a judgment about which short labels count as a full statement of the rule; it
is quoted here, not re-derived. The claim this note stands behind is the mechanical one in the row
list above: **seven sites declared the general rule in a wording other than the canon, and now zero
do.** Six sites carry it verbatim (§7 pins each), one names it without restating it, and the
remainder are applications, short labels, or the rows held on their own terms.

**The judgment calls, named rather than buried.** Two of the HELD rows are arguable — Fig 7.2's
figcaption and §15.4's checklist item are both full-rule-shaped, and a reviewer could reasonably call
either a declaration. So are the short labels that survive unconverged: `wiki/example/index.html`'s
"1 law / source dependencies point inward" stat and its mermaid edge label, and
`07-replay-and-advanced.html`'s closing "one law — source dependencies point inward". None of them is
invisible: every one is a counted line in the §7 pin, so each is a named, diffable row rather than a
private classification.

---

## 4. D8 — figure and table

Two artifacts, each unique in the tree:

* the three-ring figure, `wiki/example/index.html` §01;
* the layer table, `wiki/index.html` §7.4.

**They are different partitions, not different labels for one partition.** This is the finding that
shaped the landing, so it is recorded rather than smoothed:

* `inference`, `sensing` and `surface` are all wholly outer ring, so ring vocabulary cannot tell them
  apart — and each takes a different import rule, which is exactly what §7.4's *Hard import rule*
  column exists to draw. Replacing the layer names with ring names would have deleted that
  distinction.
* the `agent` row straddles: `tools/` is middle ring, the loop and the boundary are outer.
* `core / domain` straddles: `State`/`fold`/policy are inner, its projections and `ports/`
  interfaces are middle.

So D8 landed as **one vocabulary across both, with the ring beside the layer rather than replacing
it**: §7.4 now defines the three rings first, the layer table gains a *Ring* column naming each
row's ring and each straddle explicitly, and a closing paragraph states why both cuts exist. The
figure's ring contents were completed to match — it had omitted the surface and the context
projection, so figure and table disagreed about ring membership before they disagreed about
vocabulary. The figure's subgraph *titles* were kept close to their original length on purpose —
measured, `OUTER` went 99 → 109 characters (one added member, `surface`) and `MIDDLE` went 73 → 69
(shorter) — and the full enumeration went into the figcaption instead, because a mermaid subgraph
title is rendered inside the box and a long one wraps badly. No renderer was available here, so the
constraint was held by measurement rather than by looking at the output; that is stated, not
claimed away.

**The table is a partial refinement, and §7.4 now says so — mechanically.** §7.5's tree has eight
top-level folders (`agent`, `app`, `domain`, `inference`, `persistence`, `sensing`, `surface`,
`tools`) against the table's five rows (`core / domain`, `inference`, `sensing`, `agent`,
`surface`). `tools/` has no row but IS named inside the `agent` row, which is what gives it a ring;
`app/` and `persistence/` are named nowhere in the table at all. An earlier draft asserted the table
left nothing to be inferred, which was false — the gap is pre-existing and untouched, and the fix
was to state the claim truthfully rather than to add rows (adding rows would cascade into Fig 7.1's
five subgraphs, §17.6's layer enumeration and §7.5's tree). The pin test now DERIVES the unrowed set
from §7.5's tree against §7.4's own table text and requires §7.4's disclaimer to name every member
of it, so "and one more folder besides" is a red diff rather than an easy sentence.

**Both count claims are now derived, not asserted.** §7.4's prose ("two of its rows straddle a ring
boundary and three of them share the outer ring") and §17.6's layer row ("two layers straddle a ring,
three share the outer one") are checked against a live parse of §7.4's own Ring column by the pin
test. The first draft of this landing wrote "two of them share the outer ring" over a table with
three such rows, twice, in the two sections D8 owns, and both gates stayed green — the book had no
check that read its own tables' arithmetic. It has one now.

**§17.6 is the book's declared authority on names**, so leaving it silent while the rest of the book
adopted ring vocabulary would have made the book contradict its own nomenclature table. Two rows
were added there (the ring, the layer) rather than left for a later pass. This is a widening inside
D8's intent, recorded here because it was not in the item text.

**Six other vocabulary-bearing artifacts are affected but unpinned** — a later pass should reconcile
them, and D8 named only two of the eight: Fig 7.1's five-subgraph flowchart, Fig 7.2's eight-node
import graph, §7.5's folder tree, §7.6's forbidden-edge table, `eslint.config.js`'s §1.3 bucket
list, and `Rules.kt`'s `allowedAdrPrefixes`.

---

## 5. Ring vocabulary, reconciled

§7.4 now fixes the ring names at three values, so every other use of ring vocabulary in the book, in
`laws.toml` and in the worked example had to be read against it. The sweep is
`grep -n -iE '\bthe (one )?impure ring\b|\bthe pure ring\b|tests are the outer(most)? ring' wiki/index.html laws.toml wiki/example/*.html`.

* **`laws.toml`'s G2 note, and therefore §15.3's G2 enforcement cell.** It read "The pure ring
  imports no I/O…", which §7.4 makes ambiguous: *both* the inner and the middle ring are pure. The
  note now reads "The inner and middle rings import no I/O, await nothing, read no ambient
  environment." The book's cell was **regenerated**, never hand-edited — `npm run laws:regenerate`
  reports `matched 16/16 enforcement-map cells, rewrote 1` — because that cell is D5's generated
  output and hand-editing it would go red on the byte-for-byte regeneration check.
* **`wiki/example/02-the-boundary.html`, the `<title>` and the kicker.** "the one impure ring" became
  "the one impure object", which is the page's own thesis wording (its lede already says "make it the
  *only* impure object in the system"). §7.4 gives the outer ring five kinds of member, of which one
  performs effects, so "the one impure ring" was the wrong noun.
* **`07-replay-and-advanced.html`'s `<title>` and `wiki/example/index.html:393`'s code comment
  ("tests are the outer ring") are LEFT AS THEY ARE, deliberately.** Both are downstream of an
  explicit Clean Architecture attribution in the body of the same seam page —
  `07-replay-and-advanced.html:71`: "Clean Architecture's last word on the rings is a quiet one:
  *tests are the outermost circle.*" They belong to the same class as the attributed quotation in the
  worked example's §01 lede, which this landing also left alone. Rewording them would also strand
  `examples/README.md:27`, which cites the seam by that title. If the owner would rather see them
  reworded to Clean Architecture's own "outermost circle", that is a wording call alongside D7's, not
  a defect.
* **Out of the sweep's scope, and recorded rather than swept: the ports still call C8 "the pure
  ring".** `Rules.kt:218`, `GateTest.kt:63` and `examples/kotlin/README.md:171` bind it as a *check
  name*, in the same way the four C1 sites bind "dependencies point inward". A check label is a gate
  identifier, not a statement of the architecture's vocabulary, and renaming one breaks roster
  attribution across both ports. Named here so it is a decision and not an oversight.

---

## 6. Boundaries this landing respected

* **The G-table's generated halves are laws.toml's, never hand-edited.** D5 landed
  (`da78616`): `test/laws/registry.ts` regenerates §15.3's enforcement-map cell and pins every
  invariant-table id and name against `laws.toml`. The invariant table's **third column is guarantee
  prose that lives in the book** (`regenerate.ts` says so explicitly), which is the column the G10
  rewrite touched. G10's `name` is untouched, and the one `laws.toml` edit this landing makes (G2's
  `note`, above) went through `npm run laws:regenerate` rather than into the book by hand.
* **No port-fact entered the book (D32).** A first draft had §7.6 assert that both reference ports
  carry the sentence verbatim in their gate comments. That is a claim whose truth depends on the
  state of `examples/`, so it was cut. The book says the sentence is canonical; it does not say who
  else spells it.
* **No C-id entered the book (D30).** A first draft named `C1` in §7.6's note. `wiki/` is swept for
  check ids by `citations.ts`, and C1–C15 are check-roster internals, never book authority.
* **`docs/adr/ADR-001:298` was left alone.** It reads "Three rings, dependencies point inward, only
  the boundary is impure. **Unchanged from the book.**" Before this landing the book's *reference*
  half carried no three-ring vocabulary — `grep -c 'pure ring' wiki/index.html` returned exactly 1,
  G2's enforcement cell — while the worked example already carried the closed three-ring figure, its
  section title "The rings, and the one law", and the figcaption "Three rings". So the ADR sentence
  was reaching for something only half-present in the book; §7.4 now states it in the reference half
  too. The ADR was scrubbed in P0 (`deb9c2b`) and needs no edit.

---

## 7. The instrument

D7's claim is now mechanical, not asserted: `examples/typescript/test/laws/dependency-rule.test.ts`
pins five things, because convergence alone is cheap.

1. **Convergence.** The canonical sentence, the six declaration sites, and each site's occurrence
   count, compared on normalized text because the sentence ships in five media that all wrap it
   differently. Measured: `grep -rln "may point inward toward the core" wiki examples` finds **five
   of the six** sites and cannot see `eslint.config.js` at all, because that banner wraps the
   sentence's first clause across two lines. A line-oriented instrument would have scored this
   landing 5/6 and called it done.
2. **No inflation, and no intra-file move.** Both directions are pinned as equalities, so deleting
   paragraphs cannot raise the score and pasting the sentence into a seam page goes red. The book's
   two copies are additionally pinned at their *anchors* — the element carrying
   `id="the-dependency-rule"` and the `<tr>` whose second cell is `dependencies-point-inward` — with
   occurrences anywhere else in `wiki/index.html` pinned at zero. A bare per-file count of 2 is
   satisfied by cutting the canon out of the G10 row and pasting it into §16.4; the anchors are not.
   The normalizer strips HTML comments *before* stripping tags, because `<[^>]+>` matches from `<!--`
   to the `>` of `-->` and would otherwise swallow a commented-out paste whole.
3. **No re-divergence.** The census pool of §1 is pinned as a per-file equality map, so a brand-new
   competing full wording of the rule in the point/reach/depend/leak+inward spelling family — the
   family every censused wording used — moves a normalized occurrence and goes red; a wording
   outside that family is semantically unclosable by a grep-class instrument, and review at the
   convergence sites owns that residue. This is the claim the first draft could not make: it held convergence ("these six carry
   it, nobody else does") and said nothing about a *new* eighth wording.
4. **The book's own completeness claim.** The folders §7.5's tree names are checked against the
   folders §7.4's table names, and §7.4's "partial refinement" paragraph must name every one the
   table skips — which is the claim the first draft got wrong in the other direction, by asserting
   the table left nothing to be inferred at all.
5. **The book's own arithmetic.** §7.4's Ring column is parsed live, the wholly-in-a-ring and
   straddling partitions are derived from it, and the numerals §7.4 and §17.6 write in prose are
   parsed out of the live prose and compared against the derivation. Number words are read in
   *quantifier* position (immediately before the thing counted, or before "of"), which is what
   separates a count claim from the pronoun in "the outer one".

**One limit of the normalizer, stated rather than discovered later.** Tags are replaced with a space
before comparison, so a tag placed *inside* the canon immediately before punctuation — say
`<code>composition root</code>;` — separates the semicolon and the sentence no longer matches. That
fails in the safe direction: a legitimate spelling would go red and get fixed, never pass unnoticed.
The five-media probe in the test exercises the decorations the tree actually uses.

It is a pin test, **not** an invariant and **not** a rostered check: it mints no G-id, is absent
from `laws.toml`, and the registry requires every rostered check to trace to a law — this traces to
none. D5's bar is therefore not engaged.

Superset accounting for the +11 lines / +1 file in §1, which the pool in this note must equal:

| file | before | after | Δ | why |
|---|---|---|---|---|
| `wiki/index.html` | 9 | 8 | −1 | §7.6's lead-in stopped restating the rule |
| `examples/kotlin/README.md` | 2 | 3 | +1 | one caption line became several, the sentence wrapping |
| `examples/typescript/README.md` | 2 | 3 | +1 | same |
| `examples/typescript/eslint.config.js` | 1 | 2 | +1 | the canonical sentence adds one matching line |
| `examples/typescript/test/laws/dependency-rule.test.ts` | — | 9 | +9 | new file: the pinned constant, the five-media probe, the divergence regex |

44 − 1 + 1 + 1 + 1 + 9 = **55**, and 18 + 1 = **19 files**. Every other file in the pool is
byte-identical. The pin test's own map differs from this table on purpose: it scopes to
`wiki/` + `examples/` and excludes its own directory, so it reads **16 files / 43 lines** — the 19
files here minus `docs/DECISIONS.md`, `docs/adr/ADR-001-…md` and the test file itself.

One citation floor moved with it: `RESOLVABLE_PIN["examples/kotlin"]` 529 → 530, because C1's banner
in `Rules.kt` grew from one line to five and its `G4/G10` and `§1.3` citations now sit on two lines
instead of one. No citation was added or removed. The `wiki` and `examples/typescript` floors, and
all three `FILE_PIN`s, are unchanged.

**One asymmetry, recorded because it is a property of the design and not a hole.** The pin test lives
in the TypeScript port but polices the Kotlin port, both READMEs and the book. Measured: stripping
the canon out of `Rules.kt` leaves `./gradlew test --rerun-tasks` at BUILD SUCCESSFUL, while
`npx vitest run test/laws/dependency-rule.test.ts` fails two cases by name. The campaign gate is
*both* gates, so the Kotlin comment is covered; it is covered from the other port.

---

## 8. Open, and referred

* **The wording is the owner's.** D7 says the owner approves final wording at review. What landed is
  D7's working text, unchanged, at every site. If the owner changes one word, the change is one edit
  to `CANONICAL` in the pin test plus the six sites the test then names — the test turns a rewording
  from an archaeology problem into a red-to-green loop.
* **The repo-root `README.md` and `index.html` sit outside the instrument's `ROOTS`.** Measured: both
  carry zero pool hits today, so nothing is hidden, and D7's named scope is "the book, the example
  pages, and code comments". But a canon pasted into the repo-root README would be invisible to the
  pin. Recorded, not fixed — widening `ROOTS` is a scope call, not a defect.
* **Adjacent finding, not fixed here: 20 sites cite "§1.3's import table" and §1.3 has no import
  table.** (Measured at the baseline: 23 hits for the section token across the tree, 20 of them
  asserting the table; the count outside this note is still 23 after the landing.) Book §1.3 is
  "Build versus depend — the headline split"; the import rules live in §7.4,
  §7.5 and §7.6. Every one of those citations *resolves* (§1.3 exists), so D30's reference lint is
  silent on it — it validates that a section exists, not that it says what the citer claims. This is
  D30-shaped and wants its own item; fixing 20 sites here would have moved two citation floors for
  reasons unrelated to D7.
