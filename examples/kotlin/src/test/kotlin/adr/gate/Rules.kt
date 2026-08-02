// ── test/gate/rules — the structural half of the gate (15.2) ──────────────
// Thirteen denying checks, written against Konsist's parse tree. Three more
// (C3, C9, C14) need the compiler's TYPES and live in config/detekt/gate.yml, and
// C13 is a reflection check over values; the roster in GateTest.kt names all
// seventeen and where each one runs.
//
// 15.1 stakes the architecture's answer to its own central problem on machine
// enforcement, and the review measured (15.2) that ZERO checks shipped: Date.now() inside a tool
// and an `fs` import in the domain both passed a clean build in both reference
// ports. Each rule below ships a violating fixture it must REJECT and a compliant
// fixture it must ACCEPT — the second half is what keeps a rule from drifting into
// a nuisance authors turn off (15.2).

package adr.gate

import com.lemonappdev.konsist.api.declaration.KoClassDeclaration
import com.lemonappdev.konsist.api.declaration.KoFunctionDeclaration
import com.lemonappdev.konsist.api.declaration.KoInterfaceDeclaration
import com.lemonappdev.konsist.api.declaration.KoObjectDeclaration
import com.lemonappdev.konsist.api.declaration.KoPropertyDeclaration
import com.lemonappdev.konsist.api.declaration.KoTypeAliasDeclaration

/** The stamp (G1). None of these three may be nameable upstream of the boundary. */
private val STAMP_TYPES = setOf("Actor", "Authority", "Signature")

/**
 * The pure ring inside a block: everything but `port`, `adapter` and `view-state`.
 *
 * `internal`, not `private`, for the same reason [GateFacts] is: GateTest's N-ROOT
 * NORMALISATION test pins C8's coverage of the six relocated `blocks/<x>/Contract.kt`
 * against this set, so the selector cannot go quietly vacuous when a file moves module.
 */
internal val PURE_BLOCK_FILES = setOf("Tools.kt", "Fold.kt", "Project.kt", "Slice.kt", "Contract.kt")

/** The only three transport symbols in `adr.contract` that the SPINE itself owns (C15). */
private val SPINE_OWNED_TRANSPORT = setOf("ToolResult", "Command", "Effect")

/** The one file that implements the admission rule, and therefore the one file that
 *  may name the attributed output's members at all (C16). `internal`, like the other
 *  anchors this file publishes, so GateTest can pin it against the live tree. */
internal const val ADMISSION_HOME = "spine/pure/SpineSlice.kt"

/** The member C16 keys on. PRIVATE in [ADMISSION_HOME], and pinned as private by
 *  GateTest's ANCHORS — this rule is the tripwire on the widening, not the wall. */
internal const val ATTRIBUTION_MEMBER = "emitted"

/** The package Kotlin's sealed rule forces every transport declaration into (G12). */
internal const val CONTRACT_PACKAGE = "adr.contract"

/** One leaf's licence: WHERE it may be constructed, and HOW MANY TIMES there. */
internal data class EffectSite(val path: String, val constructions: Int)

/**
 * THE PINNED PER-LEAF SITE ROSTER for C17, declared as DATA beside the check.
 *
 * One entry per Irreversible effect leaf: the file whose arm is allowed to CONSTRUCT
 * it, and the NUMBER of constructions that file may hold. A leaf with NO entry is
 * constructible nowhere, which is the fail-closed direction.
 *
 * THE COUNT IS THE HALF THAT MATTERS, and it is what a per-FILE roster alone cannot
 * do. `blocks/escalation/Fold.kt` holds BOTH the Reversible verb's branch and the
 * Irreversible one's, so a file-level licence would let the REVERSIBLE branch
 * construct a page — the exact shape docs/DECISIONS.md:86 names — inside the one file
 * the rule has to allow. Pinning the count closes that: a second construction
 * appearing in that file is a red diff wherever in the file it sits, and it is red
 * under EVERY spelling, because the spellings are summed.
 *
 * Moving or adding a construction is a deliberate edit HERE with a reason beside it,
 * never a rule quietly loosened. GateTest pins that every entry really constructs its
 * leaf, so a moved site fails at the ANCHOR rather than going vacuous.
 */
internal val IRREVERSIBLE_SITES: Map<String, EffectSite> = mapOf(
    // the Irreversible verb `confirmEscalation`'s own success branch — once
    "PageOncall" to EffectSite("blocks/escalation/Fold.kt", 1),
    // the Irreversible verb `confirmSeal`'s own success branch — once, at seal time
    "DeliverArtifact" to EffectSite("blocks/artifact/Fold.kt", 1),
)

/** One Irreversible effect leaf, DERIVED from the contracts — never enumerated. */
internal data class IrreversibleLeaf(val union: String, val name: String) {
    val fullyQualified: String get() = "$CONTRACT_PACKAGE.$union.$name"
}

val CHECKS: List<Check> = listOf(

    // C1 — G4/G10. THE RULE, in the book's canonical wording, verbatim: an
    // import may point inward toward the core, or it is the composition root;
    // it may never point outward from the core, sideways between adapters, or
    // from a passive node — a surface or a tool — into anything but domain
    // types. §1.3's table is that sentence as an allow-list of prefixes.
    Check("C1", "dependencies point inward") { files ->
        files.flatMap { file ->
            val allowed = GateFacts().allowedAdrPrefixes(file)
            file.imports.mapNotNull { import ->
                when {
                    import.startsWith("adr.") && allowed.none { GateTrees().matches(import, it) } ->
                        Violation(file.path, "may not import $import")

                    // The agent-loop runtime is named in exactly two places (G3/G4).
                    import.startsWith("ai.torad") &&
                        !file.path.startsWith("spine/agent/") &&
                        !file.path.startsWith("app/") ->
                        Violation(file.path, "only spine/agent and the root may name the runtime: $import")

                    else -> null
                }
            }
        }
    },

    // C2 — G11: no cross-block symbol import. This is the compensation for the
    // shared `adr.contract` package that Kotlin's sealed rule forces on us (G12, in Kotlin):
    // a sibling's transport case is import-denied BY NAME PREFIX, because it cannot
    // be denied by package.
    Check("C2", "no cross-block symbol import") { files ->
        // mapNotNull carries the non-null through the TYPE SYSTEM; `filter { it != null }`
        // followed by `!!` asserts what the compiler was never told.
        files.mapNotNull { f -> f.block?.let { f to it } }.flatMap { (file, self) ->
            val prefix = self.replaceFirstChar { it.uppercase() }
            file.imports.mapNotNull { import ->
                when {
                    import.startsWith("adr.blocks.") && !GateTrees().matches(import, "adr.blocks.$self") ->
                        Violation(file.path, "imports a sibling block: $import")

                    import.startsWith("adr.contract.") -> {
                        val symbol = import.removePrefix("adr.contract.")
                        val spineOwned = symbol in SPINE_OWNED_TRANSPORT
                        if (spineOwned || symbol.startsWith(prefix)) {
                            null
                        } else {
                            Violation(file.path, "imports a sibling block's transport symbol: $import")
                        }
                    }

                    else -> null
                }
            }
        }
    },

    // C4 — G1: an Actor is UNREPRESENTABLE upstream of the boundary. Not merely
    // unused: there is no field to put one in, and no tool can name one.
    //
    // The fourth part of C4 — "a Signature is MINTED only at the boundary" — is a
    // constructor call, so it lives in detekt (config/detekt/gate.yml), where it is
    // matched as a resolved call rather than as text.
    Check("C4", "no Actor, Authority or Signature upstream of the boundary") { files ->
        files.flatMap { file ->
            val violations = mutableListOf<Violation>()

            // (a) no ToolResult VARIANT declares one — checked on the parameter's TYPE.
            file.file.classes(includeNested = true)
                .filter { cls -> cls.parents(indirectParents = false).any { it.name.endsWith("Result") } }
                .forEach { cls ->
                    cls.primaryConstructor
                        ?.parameters
                        .orEmpty()
                        .filter { it.type.name in STAMP_TYPES }
                        .forEach {
                            violations += Violation(
                                file.path,
                                "ToolResult variant ${cls.name} declares `${it.name}: ${it.type.name}`",
                            )
                        }
                }

            // (b) a pure tool may not even NAME one — it runs before the stamp exists.
            if (file.block != null && file.fileName == "Tools.kt") {
                file.imports
                    .filter { it.substringAfterLast('.') in STAMP_TYPES }
                    .forEach { violations += Violation(file.path, "a pure tool imports $it") }
            }

            // (c) Ctx carries no stamp: a tool cannot ask who is asking (§2.3).
            file.file.classes(includeNested = true)
                .filter { it.name == "Ctx" }
                .forEach { ctx ->
                    ctx.primaryConstructor
                        ?.parameters
                        .orEmpty()
                        .filter { it.type.name in STAMP_TYPES }
                        .forEach {
                            violations += Violation(file.path, "Ctx exposes ${it.type.name} to a tool")
                        }
                }

            // (e) recall confers no authority BY CONSTRUCTION (11.2): no StagedInput
            // variant may declare a stamp-typed member. The book stakes "there is no
            // field on it that could carry one" on this shape — and a claim keyed to
            // a shape no rule watches is how C7's derivation rotted. Red-proven
            // before this clause existed: `val authority: Authority = …` on Recalled
            // passed the whole gate. (The (d) slot is the detekt constructor rule.)
            file.file.classes(includeNested = true)
                .filter { cls -> cls.parents(indirectParents = false).any { it.name == "StagedInput" } }
                .forEach { cls ->
                    cls.primaryConstructor
                        ?.parameters
                        .orEmpty()
                        .filter { it.type.name in STAMP_TYPES }
                        .forEach {
                            violations += Violation(
                                file.path,
                                "StagedInput variant ${cls.name} declares `${it.name}: ${it.type.name}` — " +
                                    "recall confers no authority (11.2)",
                            )
                        }
                }

            violations
        }
    },

    // C5 — G9: the fold cannot key an effect. Effect carries no identity; the key
    // is derived from the COMMITTED step index, so it does not exist until after the
    // append returned. Only the two seams that see a committed index may name it.
    Check("C5", "only the boundary and replay may name an effect key") { files ->
        val allowedPaths = listOf("spine/boundary/", "spine/replay/", "app/")
        val declarationSites = setOf("spine/pure/KeyedEffect.kt", "spine/ports/Sink.kt")
        files.filterNot { file ->
            allowedPaths.any { file.path.startsWith(it) } || file.path in declarationSites
        }.flatMap { file ->
            file.imports
                .filter { it.substringAfterLast('.') in setOf("KeyedEffect", "EffectKey") }
                .map { Violation(file.path, "names $it, so it could mint an idempotency key") }
        }
    },

    // C6 — 12.4: a per-item failure is never session-global. A block cannot reach the
    // session banner AT ALL, which is the structural fix for "one bad ticket leaves
    // the banner degraded for the rest of the session" — not a flag to remember to
    // clear. The constructor half is in detekt; this is the reference half.
    Check("C6", "a block may not touch the session RunStatus") { files ->
        files.filter { it.block != null }.flatMap { file ->
            file.imports
                .filter { it.substringAfterLast('.') == "RunStatus" }
                .map { Violation(file.path, "a block imports RunStatus; per-item failures fold a Notice") }
        }
    },

    // C7 — G1: ONE production site for every piece of SIGNED TRANSPORT in the
    // system — ToolResult AND Command — so a recorded result can never disagree
    // with what the boundary folded, and a fold arm can never stash a Command no
    // gate ever saw into its own slice. The second half matters because State is
    // §2.3's single source of truth: an off-bus Command in a slice re-folds
    // deterministically on every replay and renders as if a principal had
    // confirmed something, while the bus record stays clean.
    //
    // The variant lists are DERIVED from the contracts, never enumerated here:
    // adding a verb stays four appends (§11.1) and is covered the moment its case
    // exists. `is TriageCommand.SetPriority ->` is a MATCH and stays legal
    // everywhere; `TriageCommand.SetPriority(` is a CONSTRUCTION and does not.
    //
    // NAMED RESIDUE, AND IT IS NOW THIS PORT'S ALONE. A data-class variant also
    // ships `copy()`, and `cmd.copy(…)` on a received command is a mint this
    // text-level rule cannot see. The TypeScript port closed ITS half — the
    // object spread `{ ...received }` — at the type, by sealing what the fold
    // and a committed record accept with a brand no spread can carry. There is
    // no Kotlin twin of that move, and the reason is measured rather than
    // assumed: `copy()` reproduces every constructor value including any seal,
    // so only a non-public constructor removes it — and that removes the VERB
    // BODY with it, because ADR-001 §3's DAG declares a block's transport in
    // `:spine` while its verb table lives in `:block:<x>`. A value-copy member
    // is also what ADR-001 §1 ratifies for transport. The stamp itself is still
    // not forgeable this way — Signature is not a data class — so a copied
    // Command carries its original sig, and what a copy buys is a payload
    // edited after signing, which replay detects. Closing it structurally is
    // ADR-001 §6's open decision; the residue is held mechanically by
    // GateTest's `C7(b)` and recorded in OPEN-GAPS.md's signed-transport-copy
    // row, with the per-port asymmetry stated in each port's README.
    Check("C7", "signed transport is constructed only in a tool and at the boundary") { files ->
        val variants = GateFacts().transportVariants(files)
        val allowed = { file: GateFile ->
            (file.block != null && file.fileName == "Tools.kt") ||
                file.path == "spine/boundary/Action.kt" ||
                file.path == "spine/boundary/Gate.kt"
        }
        files.filterNot(allowed).flatMap { file ->
            variants.filter { file.codeText.contains("$it(") }
                .map { Violation(file.path, "constructs signed transport: $it(…)") }
        }
    },

    // C8 — G2: tools, arms, projections, slices and contracts are PURE. The review measured (15.2)
    // an `fs` import in the domain shipping green; seam 07's own named violation —
    // a tool that reads a live source — is caught HERE, not by the replay harness,
    // which structurally cannot see it (G9).
    Check("C8", "the pure ring performs no I/O") { files ->
        files.filter { file ->
            file.path.startsWith("spine/pure/") ||
                (file.block != null && file.fileName in PURE_BLOCK_FILES)
        }.flatMap { file ->
            val violations = mutableListOf<Violation>()

            file.file.functions(includeNested = true, includeLocal = true)
                .filter { it.hasSuspendModifier }
                .forEach {
                    violations += Violation(file.path, "`suspend fun ${it.name}` in the pure ring")
                }

            file.imports.filter {
                it.startsWith("java.io") || it.startsWith("java.net") ||
                    it.startsWith("java.nio") || it.startsWith("kotlinx.coroutines") ||
                    it.startsWith("ai.torad")
            }.forEach { violations += Violation(file.path, "imports an impure library: $it") }

            violations
        }
    },

    // C10 — G7: no service locators, no module-level mutable state. A top-level
    // `var` is a thing two callers can disagree about without either of them being
    // wired to the other, which is precisely what the composition root exists to
    // prevent. The deterministic adapters keep their own state, inside their object.
    Check("C10", "no top-level mutable state outside the boundary") { files ->
        files.filterNot { it.path.startsWith("spine/boundary/") }.flatMap { file ->
            file.file.properties(includeNested = false)
                .filter { it.isTopLevel && it.isVar }
                .map { Violation(file.path, "top-level `var ${it.name}`") }
        }
    },

    // C11 — 7.9/G13: a port is a published contract, not an implementation. Here that
    // is a property of the FOLDER rather than a convention: every top-level
    // declaration under spine/ports is an interface, so a body cannot appear without
    // the gate seeing it.
    Check("C11", "ports are interfaces only") { files ->
        files.filter { it.path.startsWith("spine/ports/") }.flatMap { file ->
            file.file.declarations(includeNested = false, includeLocal = false).mapNotNull {
                when (it) {
                    is KoInterfaceDeclaration -> null
                    is KoClassDeclaration -> Violation(file.path, "class ${it.name} — a port is an interface")
                    is KoObjectDeclaration -> Violation(file.path, "object ${it.name} — a port is an interface")
                    is KoFunctionDeclaration -> Violation(file.path, "fun ${it.name} — a port has no body")
                    is KoPropertyDeclaration -> Violation(file.path, "val/var ${it.name} — a port holds nothing")
                    is KoTypeAliasDeclaration -> Violation(file.path, "typealias ${it.name} — not a contract")
                    else -> null
                }
            }
        }
    },

    // C12 — 4.6: ephemeral view-state never folds. The axis is DECISION vs
    // EPHEMERAL, not UI vs domain: a deliberate repositioning is a verb that folds
    // and signs; a scroll offset is this file, and only the block's own projection
    // may see it. Same package, so there is no import to key on — the reference
    // itself is what is denied.
    Check("C12", "ephemeral view-state is visible only to its own projection") { files ->
        files.filter { it.block != null && it.fileName == "ViewState.kt" }.flatMap { owner ->
            files.filter { it.block == owner.block }
                .filterNot { it.fileName == "ViewState.kt" || it.fileName == "Project.kt" }
                .filter { GateTrees().mentions(it.codeText, "ViewState") }
                .map { Violation(it.path, "names ViewState; only the block's projection may see it") }
        }
    },

    // C16 — G6: the fold's ATTRIBUTED output is opened by the ADMISSION RULE and by
    // nothing else (docs/DECISIONS.md:85).
    //
    // THE WALL IS THE LANGUAGE, NOT THIS RULE. `Attributed` holds `from` and `emitted`
    // as PRIVATE constructor properties and publishes exactly one member, `admit`, so
    // `attributed.emitted`, `with(a) { emitted }` and `val (_, e) = attributed` are all
    // COMPILE errors — the last one because the class is deliberately not a `data`
    // class, so no `componentN()` exists. That is the same move `Signature` makes one
    // seam over: the wrong thing is unwritable rather than merely discouraged.
    //
    // What this rule is, therefore, is a TRIPWIRE on the one edit that would turn the
    // wall back into a convention: widening the visibility. GateTest's ANCHORS test
    // pins the private shape itself, so the two halves watch each other.
    //
    // A PROPERTY READ, AND ONLY THAT — the DOTTED form, never the bare token. Two
    // things follow, and both were measured on this tree before the clause was written:
    // a NAMED-ARGUMENT construction (`Attributed(from = from, emitted = effect)`) stays
    // legal, and so does ordinary English prose in a KDoc attached to a declaration.
    // `codeText` excludes only the file-HEADER comment blocks; a declaration's own KDoc
    // is inside it, so a token scan would red the build on a sentence about what an arm
    // emitted — 15.2's "a nuisance authors turn off", with ForbiddenSuppress locked and
    // no exit.
    // C14 — G3: THE LOOP IS A DECLARATION, and this clause is FILE-SCOPED on
    // purpose. The type-aware half (detekt CyclomaticComplexMethod, threshold 2,
    // config/detekt/gate.yml) measures NAMED FUNCTIONS — and the shipped loop's
    // only decision site is a lambda in a superclass-constructor argument list,
    // which that rule never reaches. A review shipped an if/else, a three-arm
    // `when`, an elvis AND a `&&` inside `onStepFinish` with the whole Kotlin
    // gate green, while the same constructs redden the TypeScript port
    // immediately: its eslint selectors are file-scoped, so the two ports
    // enforced G3 at different strengths while laws.toml stated one cell for
    // both. This restores parity by matching the TypeScript SCOPE — anywhere in
    // an agent-folder file, not anywhere in a named function.
    //
    // Read off `codeText`, so a header comment explaining the rule cannot fire
    // it, and keyed on the KEYWORD as a token rather than on a spelling: `if`,
    // `when`, `for`, `while`, `try` and the elvis operator are the decision
    // forms the language has. `&&`/`||` are deliberately NOT denied here — the
    // detekt half already counts them inside any named function, and denying a
    // boolean AND in a declaration would redden the legitimate guard clauses the
    // loop's own helpers use.
    Check("C14", "the loop is a declaration, not a program") { files ->
        val decisions = Regex("""\b(if|when|for|while|try)\b|\?:""")
        // COMMENTS ARE PROSE, NOT CODE. `codeText` drops the file header but KEEPS
        // the KDoc attached to each declaration, and this file's KDoc legitimately
        // contains the English words "for" and "when" — measured, three matches on
        // the clean tree. A rule that fires on its own explanation is the
        // false-positive half of §15.2's nuisance test, so both comment forms are
        // stripped before the scan.
        val strip = Regex("""/\*[\s\S]*?\*/|//[^\n]*""")
        files.filter { it.path.startsWith("spine/agent/") }.flatMap { file ->
            decisions.findAll(strip.replace(file.codeText, " ")).map { found ->
                Violation(
                    file.path,
                    "the agent loop decides (`${found.value}`) — decisions belong to the fold (G3)",
                )
            }.toList()
        }
    },

    Check("C16", "only the admission rule opens the fold's attributed output") { files ->
        val read = Regex("""\.\s*${Regex.escape(ATTRIBUTION_MEMBER)}\b""")
        files.filterNot { it.path == ADMISSION_HOME }
            .filter { read.containsMatchIn(it.codeText) }
            .map {
                Violation(
                    it.path,
                    "reads `.$ATTRIBUTION_MEMBER`; an effect reaches perform through `admit`",
                )
            }
    },

    // C17 — G6, and docs/DECISIONS.md:86's NOW layer verbatim: "a static check denies
    // Irreversible-class effects from Reversible-classified verbs' arms".
    //
    // DERIVED, NEVER ENUMERATED. The leaf set is read out of the contracts — every
    // `Effect` leaf whose own SUPERCLASS CALL passes `EffectClass.Irreversible` — so a
    // leaf promoted from Routine is covered the moment its contract says so. The same
    // idiom C7 uses for transport variants, and for the same reason: a hand-listed set
    // stops covering the tree the day the tree moves.
    //
    // MATCH vs CONSTRUCTION, the line C7's banner already draws: `is X ->` is a MATCH
    // and stays legal everywhere; `X(` is a CONSTRUCTION and does not — outside the
    // leaf's own pinned site in [IRREVERSIBLE_SITES], and beyond the COUNT that site is
    // pinned to, which is the half a per-file roster cannot express.
    //
    // THE SPELLINGS THIS RESOLVES — stated, because a wall's written scope is what
    // SOUND is judged against. Resolved per file from its own imports and
    // typealiases: the union-qualified, aliased, typealiased, nested-class-imported,
    // fully-qualified, FLAT-WILDCARD (`import adr.contract.*`) and NESTED-STAR
    // (`import adr.contract.EscalationEffect.*`) spellings, each counted on its own.
    //
    // THIS PARAGRAPH HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND BOTH ARE
    // RECORDED HERE BECAUSE THE CLASS IS THE POINT. It first blamed the flat wildcard,
    // which a review measured the check DOES catch. The correction named the nested
    // star as unclosable — and the SAME diff that wrote that sentence also closed the
    // nested star twenty lines below, so the paragraph shipped contradicting its own
    // code, which is the exact defect that diff was titled after. A residue paragraph
    // naming a spelling the check does catch is worse than none: it sends the next
    // author looking in the wrong place. Re-measured on the live tree for this
    // wording: flat wildcard -> C17 FAILED, nested star -> C17 FAILED, and a two-hop
    // typealias chain (`typealias A = EscalationEffect; typealias B = A`) does not
    // compile at all, so it is not an evasion to close.
    //
    // WHY THAT RESIDUE IS NOT CLOSED HERE, AND WHERE IT IS. Konsist models
    // DECLARATIONS, not resolved expressions (Tree.kt's banner), so this check is a text
    // matcher over declaration bodies, and "any construction of an Irreversible leaf, in
    // any spelling" is not a class a text matcher can close: what remains open is any
    // route where the leaf's NAME does not appear in the constructing declaration at
    // all — reflection, or a generic factory instantiated with the type. No spelling
    // this check could add reaches those, which is the reasoned bound, not a measured
    // probe. The TOTAL wall is the runtime one:
    // `EffectAdmission.admit`, applied in the SHARED re-derivation (Replay's three fold
    // loops and the boundary alike, docs/DECISIONS.md:85-89), which refuses on the
    // effect's own CLASS regardless of how the construction was spelled or where it was
    // written. This check is a fast author-time signal for the ordinary spellings, not
    // the guarantee — and a scope proposal to close the wildcard case belongs at a layer
    // that sees resolved types (detekt with type resolution, or a must-fail compilation
    // fixture), never as a sixth spelling in this list.
    //
    // SCOPE: production sources only. `liveTree()` reads `src/main/kotlin/adr` and
    // nothing else, so the admission probes' rogue folds — which construct exactly this
    // shape, deliberately — stay legal. A C17 that reds the probe proving the runtime
    // half of docs/DECISIONS.md:85 is a C17 that made the runtime half unshippable.
    Check("C17", "an Irreversible effect is constructed only at its own pinned site (ordinary spellings; the runtime admission is the total wall)") { files ->
        val leaves = GateFacts().irreversibleLeaves(files)
        files.flatMap { file ->
            leaves.flatMap { leaf ->
                val site = IRREVERSIBLE_SITES[leaf.name]
                val spellings = GateFacts().spellingsOf(file, leaf).sorted()
                if (site?.path == file.path) {
                    // THE COUNT HALF, at the one file that may construct this leaf.
                    val held = spellings.sumOf { GateTrees().constructions(file.codeText, it) }
                    if (held == site.constructions) {
                        emptyList()
                    } else {
                        listOf(
                            Violation(
                                file.path,
                                "is pinned to ${site.constructions} construction(s) of " +
                                    "`${leaf.name}` and holds $held — a second one in a " +
                                    "Reversible verb's branch is the shape the roster denies",
                            ),
                        )
                    }
                } else {
                    spellings
                        .filter { GateTrees().constructions(file.codeText, it) > 0 }
                        .map {
                            Violation(
                                file.path,
                                "constructs the Irreversible effect leaf `$it(…)`; its only " +
                                    "pinned site is `${site?.path ?: "(none)"}`",
                            )
                        }
                }
            }
        }
    },

    // C15 — G14: THE SPINE TIER IS SELF-CONTAINED, therefore vendorable.
    //
    // 1.3 used to promise "zero of their source lives in your repository" for the
    // spine, and no spine package exists on any registry. The honest claim is
    // different and stronger: the spine is a FIXED, SMALL, SELF-CONTAINED TIER you
    // vendor once and never author per feature. That claim is only worth making if
    // the tier really names nothing in your feature code — so this check makes the
    // build prove it instead of prose asserting it.
    //
    // IT IS NOT REDUNDANT WITH C1. C1 is a per-folder ALLOW-list; C15 is a
    // tier-level DENIAL that no per-folder rule can accidentally relax, and it
    // survives a future spine folder arriving with a permissive bucket. In Kotlin it
    // also catches something C1 structurally cannot: the sealed-hierarchy rule forces
    // every transport declaration into `adr.contract`, and C1 PERMITS `adr.contract`
    // from spine folders — so without C15 a spine file could name
    // `adr.contract.TriageResult` through an import C1 waves straight through.
    Check("C15", "the spine tier is self-contained and vendorable") { files ->
        files.filter { it.path.startsWith("spine/") }.flatMap { file ->
            file.imports.mapNotNull { import ->
                when {
                    import.startsWith("adr.blocks.") ->
                        Violation(file.path, "[C15] the spine tier may not name a block: $import")

                    import.startsWith("adr.app.") ->
                        Violation(file.path, "[C15] the spine tier may not name the root: $import")

                    import.startsWith("adr.contract.") &&
                        import.removePrefix("adr.contract.") !in SPINE_OWNED_TRANSPORT ->
                        Violation(
                            file.path,
                            "[C15] a block's transport symbol, reachable only because Kotlin " +
                                "forces one package for a sealed hierarchy: $import",
                        )

                    else -> null
                }
            }
        }
    },
)

/**
 * The two derivations the checks above read, on a constructed type. Test sources are
 * in scope for no-loose-top-level-fun, and a helper nothing can construct is no more
 * testable for living beside the tests. `internal`, not `private`: GateTest's ANCHORS
 * test pins `transportVariants` against the live tree, so the derivation cannot go
 * quietly vacuous again — which is worth more than file-privacy.
 */
internal class GateFacts {

    /** §1.3's table, verbatim: what each folder MAY import. Anything else is denied. */
    fun allowedAdrPrefixes(file: GateFile): List<String> = when {
        file.path.startsWith("spine/pure/") -> listOf("adr.spine.pure", "adr.contract")
        file.path.startsWith("spine/ports/") -> listOf("adr.spine.pure", "adr.contract")
        file.path.startsWith("spine/boundary/") ->
            listOf("adr.spine.pure", "adr.contract", "adr.spine.ports")

        // spine/concurrency is the barge-in machinery (12). It gets the SAME bucket as
        // spine/surface: it needs the boundary's FinishedStep type to hand a turn its one
        // channel, and it must NEVER reach spine/agent — the agent-loop SDK stays confined
        // to one file (G3), which is why the TurnRunner is injected instead.
        file.path.startsWith("spine/agent/") ||
            file.path.startsWith("spine/surface/") ||
            file.path.startsWith("spine/concurrency/") ||
            file.path.startsWith("spine/replay/") ->
            listOf("adr.spine.pure", "adr.contract", "adr.spine.ports", "adr.spine.boundary")

        file.block != null -> listOf("adr.spine.pure", "adr.contract", "adr.blocks.${file.block}")
        file.path.startsWith("app/") -> listOf("adr")
        else -> emptyList()
    }

    /**
     * Every `<Union>.<Variant>` spelling of a ToolResult or Command case, DERIVED
     * from the contracts.
     *
     * It reads CLASSES as well as interfaces, and that is a scar, not a nicety: the
     * first version read interfaces only, and the day the transport migrated to
     * sealed classes it began deriving an EMPTY variant list from the live tree —
     * C7 passed on anything, while its own interface-style fixtures kept its
     * block-test green. A derivation must be written against every shape its
     * fixtures can take, or the fixtures stop standing in for the tree.
     */
    fun transportVariants(files: List<GateFile>): Set<String> =
        files.flatMap { file ->
            val classUnions = file.file.classes(includeNested = true)
                .filter { it.name.endsWith("Result") || it.name.endsWith("Command") }
                .flatMap { union ->
                    union.classes(includeNested = false).map { "${union.name}.${it.name}" }
                }
            val interfaceUnions = file.file.interfaces(includeNested = true)
                .filter { it.name.endsWith("Result") || it.name.endsWith("Command") }
                .flatMap { union ->
                    union.classes(includeNested = false).map { "${union.name}.${it.name}" }
                }
            classUnions + interfaceUnions
        }.toSet()

    /**
     * EVERY IRREVERSIBLE EFFECT LEAF, DERIVED from the contracts (C17).
     *
     * A leaf is a class whose direct parent is an effect sub-union and whose own name
     * does not itself end in `Effect` — the same shape GateTest's effect census reads —
     * and it is IRREVERSIBLE when its SUPERCLASS CALL passes `EffectClass.Irreversible`.
     * Reading the superclass CALL rather than a property is what makes the
     * classification unlaunderable: a leaf's public constructor has no such parameter,
     * so no arm and no `copy()` can move an effect between classes.
     */
    fun irreversibleLeaves(files: List<GateFile>): Set<IrreversibleLeaf> =
        files.flatMap { file -> file.file.classes(includeNested = true) }
            .filterNot { it.name.endsWith("Effect") }
            .mapNotNull { cls ->
                val union = cls.parents(indirectParents = false)
                    .map { it.name }
                    .firstOrNull { it.endsWith("Effect") }
                if (union != null && IRREVERSIBLE_CALL.containsMatchIn(cls.text)) {
                    IrreversibleLeaf(union, cls.name)
                } else {
                    null
                }
            }
            .toSet()

    /**
     * WHAT [leaf] IS CALLED INSIDE [file] — every spelling that would CONSTRUCT it,
     * resolved from this file's own imports and typealiases rather than from a frozen
     * list (C17).
     *
     * C17's entry point, and it delegates: the walk itself is [spellingsOf] below,
     * which takes the package it resolves against as an argument. C17 always resolves
     * against [CONTRACT_PACKAGE], because Kotlin's sealed rule puts every transport
     * declaration there.
     */
    fun spellingsOf(file: GateFile, leaf: IrreversibleLeaf): Set<String> =
        spellingsOf(file, CONTRACT_PACKAGE, leaf.union, leaf.name)

    /**
     * THE SAME WALK, WITH THE PACKAGE PASSED IN — what `$pkg.$union.$case` is called
     * INSIDE [file], in every spelling that would construct it.
     *
     * ONE BODY, TWO CALLERS, and the parameterisation is the point rather than an
     * abstraction for its own sake. C17 resolves effect leaves out of `adr.contract`;
     * GateTest's blast-radius census resolves `adr.spine.pure.Verb`'s two
     * classifications out of the spine. Both questions are "what does THIS file call
     * that declaration", and answering them from two hand-kept spelling lists is the
     * failure class this repository has already paid for four times — the KDoc on
     * [GateFile.importLines] records the C4 instance. A rule keyed on the literal text
     * `Verb.Reversible` is defeated by one keystroke; a rule keyed on the
     * fully-qualified declaration and resolved through the file's own header is not.
     *
     * THE FIVE REBINDINGS THE LANGUAGE OFFERS, all followed:
     *
     *   the fully-qualified spelling                 `adr.spine.pure.Verb.Reversible(`
     *   an import of the union                       `import …Verb`         -> `Verb.Reversible(`
     *   an import of the case, aliased or not        `import …Verb.Reversible as R` -> `R(`
     *   a STAR import of the package                 `import adr.spine.pure.*` -> `Verb.Reversible(`
     *   a typealias onto either                      `typealias R = …`      -> `R(`
     *
     * The star clause is the one this generalisation ADDS, and it is added to the
     * shared body deliberately rather than to the new caller alone: a resolver that
     * two rules share must not answer differently for each. It is fail-CLOSED for C17
     * (more spellings resolve, so more constructions are seen), and measured, it moves
     * nothing on any tree this repository holds — no file under `examples/kotlin`
     * star-imports anything. The new fixture pair proves the accept half; a probe
     * against the live tree proved the deny half.
     */
    fun spellingsOf(file: GateFile, pkg: String, union: String, case: String): Set<String> {
        val fullyQualified = "$pkg.$union.$case"
        val names = mutableSetOf(fullyQualified)
        val unions = mutableSetOf<String>()
        // Kotlin's sealed rule puts every transport declaration in ONE package, so a
        // file that already lives there needs no import to name the union.
        if (file.packageName == pkg) unions += union
        file.importLines.forEach { line ->
            val body = line.removePrefix("import").trim()
            val path = body.substringBefore(" as ").trim()
            val alias = if (" as " in body) body.substringAfterLast(" as ").trim() else null
            if (path == fullyQualified) names += (alias ?: case)
            if (path == "$pkg.$union") unions += (alias ?: union)
            if (path == "$pkg.*") unions += union
            // THE NESTED STAR, `import adr.contract.EscalationEffect.*`, which brings
            // every leaf of one union into scope under its BARE name. A review measured
            // this walking straight past C17 from inside the union's own block, where no
            // other rule catches it; the flat wildcard above was already resolved, so
            // the residue paragraph blamed the wrong form. Adding the bare case name is
            // fail-CLOSED, exactly as the other spellings are.
            if (path == "$pkg.$union.*") names += case
        }
        names += unions.map { "$it.$case" }
        file.typeAliases.forEach { (alias, right) ->
            // The alias's TARGET, with any type arguments dropped: `typealias Rev =
            // Verb.Reversible<S, I, R>` rebinds the same declaration as `typealias Rev =
            // PageOncall` does, and a comparison that kept the `<…>` would follow the
            // rebinding for a monomorphic declaration and lose it for a generic one —
            // which is a spelling distinction wearing a type-system costume.
            val target = right.substringBefore('<').trim()
            if (target in names) names += alias
            if (target in unions || target == "$pkg.$union") {
                names += "$alias.$case"
            }
        }
        return names
    }
}

/** The superclass call that CLASSIFIES a leaf — `: SomeEffect(at, EffectClass.Irreversible)`.
 *  Anchored on the delegation call so a mention in a KDoc cannot be read as a
 *  classification. */
private val IRREVERSIBLE_CALL = Regex(""":\s*[\w.]+\s*\([^)]*EffectClass\.Irreversible""")
