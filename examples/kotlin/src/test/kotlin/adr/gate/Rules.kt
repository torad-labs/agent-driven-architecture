// ── test/gate/rules — the structural half of the gate (15.2) ──────────────
// Eleven denying checks, written against Konsist's parse tree. The other three
// (C3, C9, C14) need the compiler's TYPES and live in config/detekt/gate.yml; the
// roster in GateTest.kt names all fourteen and where each one runs.
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
    // NAMED RESIDUE: a data-class variant also ships `copy()`, and `cmd.copy(…)`
    // on a received command is a mint this text-level rule cannot see. The stamp
    // itself cannot be forged that way — Signature is not a data class — so a
    // copied Command carries its original sig; closing the rest structurally is
    // ADR-001 §6.6's witness token.
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
}
