// ── test/gate/tree — how the structural half of the gate reads the tree ───
//
// Konsist parses the tree with the Kotlin compiler front-end and hands back
// declarations: imports with their fully-qualified names, packages, classes with
// their parents, constructor parameters with their TYPES, properties that know
// whether they are `var` and whether they are top-level, functions that know
// whether they are `suspend`. Every rule in Rules.kt is written against THAT, not
// against the source text.
//
// Why that distinction is worth a dependency: the previous gate was a regex over
// the file text with a hand-written comment stripper and a hand-written brace
// matcher. It worked, and it still missed things — the elvis in spine/agent/loop
// slipped past a C14 that looked for `if (`, `for (`, `while (` and `try {`.
// A parser does not have that class of bug.
//
// Two files still need to look INSIDE a declaration (C7's construction sites and
// C12's view-state references), because Konsist models declarations and not
// expressions. Those two read `codeText` below, which is the concatenation of the
// file's DECLARATIONS — so a rule can never fire on the prose in a file header,
// which is exactly the false positive the old stripper existed to avoid.

package adr.gate

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.declaration.KoFileDeclaration

/**
 * One file of a tree the gate reads, with its path normalised to that tree's root —
 * and with [root], the tree it was READ FROM, kept rather than discarded.
 *
 * Keeping it is the whole of the module-ownership pin. Normalisation is deliberately
 * lossy (see [GateTrees.treeOf]): `block/analysis/adapter/src/main/kotlin/adr/blocks/
 * analysis/Adapter.kt` and `block/analysis/src/main/kotlin/adr/blocks/analysis/
 * Adapter.kt` both come back as `blocks/analysis/Adapter.kt`, which is exactly what
 * lets one rule set defend N module roots. The cost is that WHICH MODULE a file was
 * compiled in stops being a fact any check can see — and the module is where ADR-001
 * §5's pure/adapter split is actually enforced, because the IO-library ban is a
 * CLASSPATH ban keyed on the Gradle module while every file rule is keyed on the
 * normalised path. Decoupling the two lets a file walk out from under its ban with its
 * path, and therefore every rule that reads it, unchanged.
 */
class GateFile(val path: String, val file: KoFileDeclaration, val root: String) {

    val fileName: String = path.substringAfterLast('/')

    /** The owning block, for a file under blocks/<X>/. Null for the spine and the root. */
    val block: String? =
        if (path.startsWith("blocks/")) path.removePrefix("blocks/").substringBefore('/') else null

    /** Fully-qualified import names, straight off the parse tree. */
    val imports: List<String> = file.imports.map { it.name }

    /**
     * The import lines VERBATIM — `import a.b.C as D` — so a rule can resolve what a
     * name means INSIDE THIS FILE rather than against a frozen table. C17 needs this:
     * a name-keyed construction rule that cannot follow `as Ev` is defeated by one
     * keystroke, which is the failure class this repository already paid for in C4.
     */
    val importLines: List<String> = file.imports.map { it.text }

    /** `alias to right-hand side`, from this file's OWN typealias declarations —
     *  the second rebinding a name-keyed rule cannot follow. */
    val typeAliases: List<Pair<String, String>> =
        file.typeAliases.map { it.name to it.text.substringAfter("=").trim() }

    /** The declared package — `adr.contract` for every transport file (G12, in Kotlin). */
    val packageName: String = file.packagee?.name.orEmpty()

    /**
     * The file's DECLARATIONS, concatenated. Not the file text: the header comment
     * blocks that explain each rule are excluded, so a rule cannot fire on prose
     * that merely names a forbidden symbol.
     */
    val codeText: String by lazy {
        val parts = file.declarations(includeNested = false, includeLocal = false)
            .filterIsInstance<com.lemonappdev.konsist.api.provider.KoTextProvider>()
            .map { it.text }
        parts.joinToString("\n")
    }

    override fun toString(): String = path
}

data class Violation(val path: String, val message: String)

/**
 * ONE RIM CLASS, AS FACTS RATHER THAN AS A DECLARATION: the implementation's name, the
 * block port interface it implements, the block that owns that port, and the module
 * root the file declaring it was READ FROM.
 *
 * Four `String`s and nothing else, deliberately. [GateTrees.rimViolation] is written
 * over this type rather than over a [GateFile], so the same predicate that defends the
 * live tree can be pointed at a SYNTHETIC rim class — a [GateFile] wraps a Konsist
 * declaration and cannot be forged, and a rule nobody has watched reject something is
 * not a rule (15.2).
 */
data class RimClass(val className: String, val port: String, val block: String, val root: String)

/**
 * One denying rule. It runs over any tree, which is what lets the SAME code that
 * defends the live sources be pointed at a violating fixture and a compliant one.
 */
class Check(val id: String, val title: String, val run: (List<GateFile>) -> List<Violation>)

/**
 * READING THE TREES THE GATE DEFENDS, on a constructed type.
 *
 * Test sources are in scope for no-loose-top-level-fun — it ignores build/,
 * node_modules/, dist/ and *.gradle.kts, and nothing else — and deliberately so: a
 * helper nothing can construct is no more testable for living next to the tests.
 */
class GateTrees {

    /**
     * Read a tree, normalising every path to be relative to [root] so a fixture at
     * `.../C1/blocks/triage/Fold.kt` and the live file at
     * `src/main/kotlin/adr/blocks/triage/Fold.kt` are both seen as
     * `blocks/triage/Fold.kt`. The rules therefore cannot tell the two apart, which is
     * the property that makes a fixture pair meaningful.
     */
    fun treeOf(root: String, marker: String = "/" + root.trim('/') + "/"): List<GateFile> =
        Konsist.scopeFromDirectory(root)
            .files
            .map { GateFile(it.path.substringAfter(marker), it, root) }
            .sortedBy { it.path }

    /**
     * THE LIVE TREE, now spread over N Gradle module roots (ADR-001 §3's DAG).
     *
     * The marker is passed EXPLICITLY here, and that is the whole migration. A live
     * root is `<moduleDir>/src/main/kotlin/adr`, so normalising on the fixed
     * [LIVE_MARKER] makes `spine/src/main/kotlin/adr/spine/pure/Actor.kt` and
     * `spine/src/main/kotlin/adr/blocks/triage/Contract.kt` come back as
     * `spine/pure/Actor.kt` and `blocks/triage/Contract.kt` — BYTE-IDENTICAL to what
     * the single-module tree emitted. Every rule selector, every path pin and every
     * roster in Rules.kt and GateTest.kt therefore keeps binding, unedited.
     *
     * WHAT MUST NOT BE DONE, proven: fixing that marker GLOBALLY — for [fixtureTree]
     * too — breaks eight of this file's own tests. [fixtureTree] keeps the DERIVED
     * marker, because a fixture root is `src/test/fixtures/konsist/<polarity>/<check>`
     * and contains no `/src/main/kotlin/adr/` segment at all; Kotlin's
     * `substringAfter` returns the WHOLE receiver when the delimiter is absent, so
     * fixture paths would stop normalising, [GateFile.block] would go null for every
     * one of them, and C2/C8's block-tests would report "the violating fixture was
     * ACCEPTED" — a vacuous ACCEPT, the worst reading a gate can produce.
     */
    fun liveTree(): List<GateFile> =
        MODULE_ROOTS.flatMap { treeOf(it, LIVE_MARKER) }.sortedBy { it.path }

    /** A fixture tree: `violating` or `compliant`, for one check. Marker DERIVED — see above. */
    fun fixtureTree(polarity: String, check: String): List<GateFile> =
        treeOf("src/test/fixtures/konsist/$polarity/$check")

    /**
     * THE TEST TREE — the gate's own sources, read the same way.
     *
     * A SEPARATE marker and a separate entry point, deliberately: [LIVE_MARKER] and
     * [fixtureTree]'s derived marker are both load-bearing (see the KDoc above — a
     * GLOBAL marker fix breaks eight of GateTest's own tests and turns C2/C8's
     * block-tests into vacuous ACCEPTs), so this adds a third reader rather than
     * widening either.
     *
     * It exists because a census that walks only `src/main` cannot see a cost that
     * moved into a test file — which is exactly where the handler split's remaining
     * out-of-folder cost lives. An instrument blind to the site it is reporting on is
     * worse than no instrument, so the site is now inside the instrument's field of
     * view and asserted as an EQUALITY.
     */
    fun testTree(): List<GateFile> = treeOf("src/test/kotlin/adr", TEST_MARKER)

    /** True when [import] is exactly [prefix] or a member of it. */
    fun matches(import: String, prefix: String): Boolean =
        import == prefix || import.startsWith("$prefix.")

    /** Does [code] contain [token] as a whole word (not as part of a longer identifier)? */
    fun mentions(code: String, token: String): Boolean =
        Regex("""(^|[^A-Za-z0-9_])${Regex.escape(token)}($|[^A-Za-z0-9_])""").containsMatchIn(code)

    /**
     * How many times [code] CONSTRUCTS [spelling] — `Spelling(`, and never as the tail of
     * a longer name (C17).
     *
     * The negative lookbehind on `[\w.]` is what makes the spellings SUMMABLE: without
     * it, one fully-qualified `adr.contract.EscalationEffect.PageOncall(` would be
     * counted a second time by the union-qualified spelling nested inside it, and the
     * count pin would fire on a file that constructs the leaf exactly once.
     */
    fun constructions(code: String, spelling: String): Int =
        Regex("""(?<![\w.])${Regex.escape(spelling)}\s*\(""").findAll(code).count()

    /**
     * THE TWO MODULE ROOTS OF ADR-001 §5's RATIFIED PAIR, single-sourced.
     *
     * Every clause below spells a block's roots through these two and never inline. The
     * pair is the thing this pin is ABOUT, so a second spelling of either would be a
     * place the pin could drift away from itself; GateTest's TIE-BACK asserts both
     * templates really name directories [MODULE_ROOTS] holds, so the convention that
     * the normalised `blocks/<x>/` segment IS the Gradle module directory name is
     * checked rather than assumed.
     */
    fun pureRoot(block: String): String = "block/$block/src/main/kotlin/adr"

    /** [block]'s IO leaf — the one member of the pair with no IO-library ban on it. */
    fun adapterRoot(block: String): String = "block/$block/adapter/src/main/kotlin/adr"

    /**
     * WHICH MODULE ROOTS MAY OWN [path] — ADR-001 §3/§5's layout, read FORWARDS.
     *
     * A PURE FUNCTION OF THE NORMALISED PATH, and the signature is the guarantee: it
     * takes a `String`, never a [GateFile], so it CANNOT consult the root the file was
     * actually read from. That is not style. An `owedRoots(file)` that reached for
     * `file.root` would make the ownership assertion a tautology — permanently green,
     * agreeing with every future relocation — which is precisely the rot this
     * repository already shipped once at C7.
     *
     * ONE CLAUSE PER TIER, AND NO FILE NAME DECIDES PURE-VS-ADAPTER. That second half is
     * the correction this derivation exists to embody. A clause reading
     * `fileName == "Adapter.kt" -> the leaf` denies a SPELLING, and a spelling is bought
     * back by `git mv Adapter.kt Rim.kt`: measured, whole gate green, exploit intact. It
     * also REJECTS what the ratified layout PERMITS — `docs/DECISIONS.md:53-56` gives
     * `:block:<x>:adapter` "IO allowed" and fixes neither a file count nor a file name
     * inside it, and ADR-001 §5 does not either — so an honestly-placed second client
     * file in that leaf would be told to "move into the pure module", a remediation
     * pointing AT the violation. Deny the FORM, never the spellings: this clause
     * decides which ROOTS a path tier may occupy at all, and WHICH member of the
     * pair a block's live IO must sit in is a separate, form-keyed question answered by
     * [rimViolation] over supertypes.
     *
     * The clauses, in order, and what each traces to:
     *
     *   `spine/…`, `app/…`       one root each — ADR-001 §3's DAG.
     *   no block                 EMPTY, and that is the FAIL-CLOSED default: no root is
     *                            a member of the empty set, so a path that normalised
     *                            outside all three tiers is a violation here rather than
     *                            an unowned file the derivation waves through.
     *   `blocks/<x>/Contract.kt` `:spine`. Kotlin requires every variant of a sealed
     *                            hierarchy in ONE module, so a block's transport is
     *                            authored in the spine and normalises back under
     *                            `blocks/<x>/` (ADR-001 §9's Stage 2; GateTest's N-ROOT
     *                            NORMALISATION (b) pins the six of them).
     *   the pure ring            the block's own module. [PURE_BLOCK_FILES] is this
     *                            repository's EXISTING definition of that ring — the set
     *                            C8 selects on — referenced and never re-spelled, so the
     *                            pin cannot drift away from the rule. This clause is
     *                            what keeps PURE-INTO-ADAPTER denied.
     *   anything else in a block BOTH members of §5's pair. A port, an adapter, a second
     *                            client file: the layout ratifies the PAIR, not an
     *                            occupancy, and occupancy is [rimViolation]'s job.
     */
    fun owedRoots(path: String): Set<String> {
        val block =
            if (path.startsWith("blocks/")) path.removePrefix("blocks/").substringBefore('/') else null
        val fileName = path.substringAfterLast('/')
        return when {
            path.startsWith("spine/") -> setOf(SPINE_ROOT)
            path.startsWith("app/") -> setOf(APP_ROOT)
            block == null -> emptySet()
            fileName == "Contract.kt" -> setOf(SPINE_ROOT)
            fileName in PURE_BLOCK_FILES -> setOf(pureRoot(block))
            else -> setOf(pureRoot(block), adapterRoot(block))
        }
    }

    /**
     * THE PATH-TIER VIOLATION: a file READ from a module root that ADR-001 §3/§5 do not
     * owe its own normalised path. Null when the root is one of the owed set.
     *
     * Written over two `String`s rather than over a [GateFile] so that the SAME code
     * that defends the live tree can be pointed at a synthetic violating pair and a
     * synthetic compliant one — this port's fixture-pair discipline, in the in-checker
     * shape a rule about a (path, root) RELATION can honestly take.
     *
     * The message names the FULL owed set. It must never read as "move this into the
     * pure module" for a file sitting in an IO leaf: that remediation points at the
     * violation, and shipping it is how a wall trains authors to route around itself.
     */
    fun ownershipViolation(path: String, root: String): String? {
        val owed = owedRoots(path)
        if (root in owed) return null
        val owedText = if (owed.isEmpty()) {
            "NO module root at all — it normalised outside `spine/`, `app/` and `blocks/`"
        } else {
            owed.sorted().joinToString(" or ") { "`$it`" }
        }
        return "`$path` was read from module root `$root`, and ADR-001 §3/§5 owe it to $owedText"
    }

    /**
     * THE SUPERTYPE LIST OF EVERY ANONYMOUS `object` EXPRESSION IN [code].
     *
     * The one rim spelling Konsist cannot reach: it models DECLARATIONS, not
     * expressions (the reason C7 and C12 read [GateFile.codeText] too). Without this,
     * `fun make(): AnalysisRelay = object : AnalysisRelay { … }` inside a pure block
     * file is a live rim the parse tree never reports, and the whole occupancy clause
     * is defeated by writing `object :` instead of `class`.
     */
    fun objectExpressionSupertypes(code: String): List<String> =
        Regex("""\bobject\s*:\s*([^{]*)\{""").findAll(code).map { it.groupValues[1] }.toList()

    /**
     * EVERY RIM CLASS OF [files], DERIVED FROM SUPERTYPES — never listed, never keyed on
     * a file name.
     *
     * A block's PORT is the set of interfaces its own `blocks/<x>/Port.kt` declares
     * (§4.6/G11: an interface only, which C11's sibling clause is about). A RIM CLASS is
     * anything in the tree that IMPLEMENTS one, in all three spellings the language
     * offers: a `class`, a named `object`, or an anonymous `object :` expression. Read
     * through `parents(indirectParents = false)` and `interfaces(includeNested = true)`
     * — the same idioms C4, C7 and C17 already read.
     *
     * That is a FORM, not a spelling. Renaming `Adapter.kt` to `Rim.kt`, renaming
     * `LivePager` to anything at all, or swapping `class` for `object` does not move an
     * implementation out of this set. Only deleting the port, or the `: Port` supertype,
     * does — and GateTest's RIM ANCHOR equality is red on exactly that, which is what
     * keeps this derivation from going the way C7's did.
     *
     * NOT selected, and the distinction is the whole reason supertypes are the key
     * rather than a mention: `app/Wire.kt`'s `val relay: AnalysisRelay` and
     * `blocks/analysis/Register.kt`'s `fun performer(relay: AnalysisRelay)` name the
     * port as a TYPE. Holding the port as a type is what §4.6 asks the root and the
     * register to do; IMPLEMENTING it is what ADR-001:412 confines to the leaf.
     */
    fun rimClasses(files: List<GateFile>): List<RimClass> {
        val ports: Map<String, Set<String>> = files
            .filter { it.fileName == "Port.kt" }
            .mapNotNull { file ->
                file.block?.let { block ->
                    block to file.file.interfaces(includeNested = true).map { it.name }.toSet()
                }
            }
            .toMap()

        fun found(names: Set<String>, holder: String, file: GateFile): List<RimClass> =
            ports.entries.flatMap { (block, portNames) ->
                portNames.filter { it in names }.map { RimClass(holder, it, block, file.root) }
            }

        return files.flatMap { file ->
            val declared = file.file.classes(includeNested = true).flatMap { cls ->
                found(cls.parents(indirectParents = false).map { it.name }.toSet(), cls.name, file)
            } + file.file.objects(includeNested = true).flatMap { obj ->
                found(obj.parents(indirectParents = false).map { it.name }.toSet(), obj.name, file)
            }
            val anonymous = objectExpressionSupertypes(file.codeText).flatMap { supertypes ->
                ports.entries.flatMap { (block, portNames) ->
                    portNames.filter { mentions(supertypes, it) }
                        .map { RimClass("object : $it", it, block, file.root) }
                }
            }
            declared + anonymous
        }
    }

    /**
     * THE OCCUPANCY VIOLATION, and the clause that actually closes ADAPTER-INTO-PURE: a
     * block's live rim compiled anywhere but the IO leaf of ADR-001 §5's pair.
     *
     * ADR-001:412 is the ratified text — `LivePager`, `LiveDelivery`, `LiveRelayWriter`
     * "leave `:block:<x>` for the adapter leaf" — and it freezes CLASSES, never file
     * names. So this predicate is keyed on the class and its port, and a rename of
     * either the file or the class moves nothing.
     */
    fun rimViolation(rim: RimClass): String? =
        if (rim.root == adapterRoot(rim.block)) {
            null
        } else {
            "`${rim.className}` implements `${rim.port}`, the port `blocks/${rim.block}/Port.kt` " +
                "declares, so it is that block's live rim — and it was read from module root " +
                "`${rim.root}`. ADR-001:412 freezes the rim CLASSES into " +
                "`${adapterRoot(rim.block)}`, the one member of ADR-001 §5's pair with no " +
                "IO-library ban on its classpath"
        }

        /**
         * The path segment every module puts its `adr/` subtree under. Fixed, not
         * derived, because there are now N live roots and they must all normalise onto
         * ONE relative namespace.
         */
        val LIVE_MARKER: String = "/src/main/kotlin/adr/"

        /**
         * The same fixed-marker trick for the gate's OWN sources, so `app/TotalityTest.kt`
         * and `gate/GateTest.kt` normalise onto the same relative namespace the live tree
         * uses. Separate from [LIVE_MARKER] because that one may not move.
         */
        val TEST_MARKER: String = "/src/test/kotlin/adr/"

        /**
         * `:spine`'s root, and `:app`'s. Named because [owedRoots] and [MODULE_ROOTS]
         * would otherwise spell each of them twice, and this pin is precisely about a
         * path naming its module: a derivation that drifted from the root list it is
         * checked against would be a wall arguing with itself.
         */
        val SPINE_ROOT: String = "spine/src/main/kotlin/adr"

        /** `:app`'s root — the composition root, the one module carrying no IO ban. */
        val APP_ROOT: String = "app/src/main/kotlin/adr"

        /**
         * EVERY source-bearing module root of ADR-001 §3's DAG. ADR-001 §9's Stages
         * 2-4 have landed, so the root project's own `src/main/kotlin/adr` is GONE
         * from this list and from the disk: `:spine` holds the kernel and the six
         * blocks' `Contract.kt`, each `:block:<x>` holds its slice, the three blocks
         * that own live IO hold it in `:block:<x>:adapter`, and `:app` holds the
         * composition root.
         *
         * A module whose sources exist and whose root is NOT here would be invisible to
         * all eleven konsist checks while every test stayed green — the vacuous-tree
         * failure. `GateTest`'s MODULE ROOTS test derives the roots from the disk and
         * fails on exactly that.
         *
         * ELEVEN, not fourteen: `:block:console:adapter`, `:block:inbox:adapter` and
         * `:block:triage:adapter` are declared modules that hold no sources, and a root
         * listed here holding zero Kotlin fails `gateSourceRootsPresent`. Their absence
         * is SAFE rather than a hole, and the two build-script tasks that make it so are
         * named here so the decision is checkable instead of merely explained:
         * `gateCompiledRootsAreGateRoots` fails the build the instant one of the three
         * compiles a file, because its root is then compiled and unlisted, and
         * `gateNoSourceOutsideAdr` covers the file that lands beside `adr/` inside a
         * root that IS listed. This KDoc used to be the only thing standing there.
         *
         * WHAT THOSE TWO DO NOT COVER, measured and closed by GateTest's MODULE
         * OWNERSHIP test: they watch what LANDS in a root. Neither watches what LEAVES
         * one. Deleting an entry from this list and from `adrModuleSourceRoots` is a
         * PERMITTED edit — it is exactly how the three source-free adapters above are
         * spelled — so a reviewer who moves a block's live IO into its PURE sibling and
         * then deletes the two entries produces a tree shape-identical to
         * `:block:console:adapter`, with the IO now compiling inside the module
         * `adr.block` declares pure, and every wall silent because the normalised path
         * never moved. That was BUILD SUCCESSFUL.
         *
         * WHAT CLOSES IT IS NOT THE PATH CLAUSE. [owedRoots] permits EITHER member of
         * ADR-001 §5's ratified pair for a block file, because the pair is what the
         * layout ratifies and a file NAME may not decide occupancy: a rule keyed on the
         * spelling `Adapter.kt` is bought back by `git mv Adapter.kt Rim.kt` — measured,
         * whole gate green — and it rejects the second client file the "IO allowed" leaf
         * (`docs/DECISIONS.md:53-56`) is entitled to. [rimViolation] closes it instead,
         * keyed on the FORM: a class, named object or `object :` expression whose
         * supertype is an interface the block's own `Port.kt` declares must be read
         * from the adapter root, whatever it and its file are called.
         *
         * FOUR WALLS, FIVE DISJOINT ESCAPES: the two rosters in GateTest (a path that
         * moved inside a listed root), `gateCompiledRootsAreGateRoots` (a compiled root
         * nobody listed), `gateNoSourceOutsideAdr` (a file beside `adr/` in a listed
         * root), and MODULE OWNERSHIP's two clauses — a file that changed MODULE without
         * changing its normalised path, and a block's live rim compiling on the pure
         * side of §5's pair.
         */
        val MODULE_ROOTS: List<String> = listOf(
            SPINE_ROOT,
            "block/analysis/src/main/kotlin/adr",
            "block/analysis/adapter/src/main/kotlin/adr",
            "block/artifact/src/main/kotlin/adr",
            "block/artifact/adapter/src/main/kotlin/adr",
            "block/console/src/main/kotlin/adr",
            "block/escalation/src/main/kotlin/adr",
            "block/escalation/adapter/src/main/kotlin/adr",
            "block/inbox/src/main/kotlin/adr",
            "block/triage/src/main/kotlin/adr",
            APP_ROOT,
        )
}
