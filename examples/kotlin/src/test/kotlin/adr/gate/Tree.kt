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

/** One file of a tree the gate reads, with its path normalised to that tree's root. */
class GateFile(val path: String, val file: KoFileDeclaration) {

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
            .map { GateFile(it.path.substringAfter(marker), it) }
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
         */
        val MODULE_ROOTS: List<String> = listOf(
            "spine/src/main/kotlin/adr",
            "block/analysis/src/main/kotlin/adr",
            "block/analysis/adapter/src/main/kotlin/adr",
            "block/artifact/src/main/kotlin/adr",
            "block/artifact/adapter/src/main/kotlin/adr",
            "block/console/src/main/kotlin/adr",
            "block/escalation/src/main/kotlin/adr",
            "block/escalation/adapter/src/main/kotlin/adr",
            "block/inbox/src/main/kotlin/adr",
            "block/triage/src/main/kotlin/adr",
            "app/src/main/kotlin/adr",
        )
}
