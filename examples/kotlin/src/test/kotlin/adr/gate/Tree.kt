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
    fun treeOf(root: String): List<GateFile> {
        val marker = "/" + root.trim('/') + "/"
        return Konsist.scopeFromDirectory(root)
            .files
            .map { GateFile(it.path.substringAfter(marker), it) }
            .sortedBy { it.path }
    }

    /** The live tree the gate defends. */
    fun liveTree(): List<GateFile> = treeOf("src/main/kotlin/adr")

    /** A fixture tree: `violating` or `compliant`, for one check. */
    fun fixtureTree(polarity: String, check: String): List<GateFile> =
        treeOf("src/test/fixtures/konsist/$polarity/$check")

    /** True when [import] is exactly [prefix] or a member of it. */
    fun matches(import: String, prefix: String): Boolean =
        import == prefix || import.startsWith("$prefix.")

    /** Does [code] contain [token] as a whole word (not as part of a longer identifier)? */
    fun mentions(code: String, token: String): Boolean =
        Regex("""(^|[^A-Za-z0-9_])${Regex.escape(token)}($|[^A-Za-z0-9_])""").containsMatchIn(code)
}
