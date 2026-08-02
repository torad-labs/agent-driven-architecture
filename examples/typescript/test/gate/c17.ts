// ── C17 — an Irreversible-class effect is constructed only at its own site ──
//
// docs/DECISIONS.md:86 asks, for the NOW layer, that "a static check denies
// Irreversible-class effects from Reversible-classified verbs' arms". This is
// that check for the TypeScript port.
//
// WHY IT IS A VITEST CHECK AND NOT AN ESLINT BUCKET — the same reason C13 is.
// An eslint bucket is a per-FILE rule, and the illegitimate construction lives
// INSIDE a file a per-file rule would have to allow: `blocks/escalation/fold.ts`
// registers a Reversible verb (`requestEscalation`) and an Irreversible one
// (`confirmEscalation`) into ONE arm, so "may this file construct a PageOncall?"
// has no file-level answer. The question is about the TREE — which files may
// construct which leaf, and how many times — so it is asked of the tree.
//
// DERIVED, NEVER ENUMERATED. The Irreversible leaf set is read out of the
// contracts: an interface extending `EffectBase` that narrows `effectClass` to
// the literal `"Irreversible"`. A leaf promoted from Routine to Irreversible is
// covered the moment its contract says so, and a derivation that walked to
// nothing fails LOUDLY at the anchor pin in c17.test.ts (the C7 rot, refused in
// advance) rather than matching nothing, silently, forever.
//
// MATCH vs CONSTRUCTION — the line konsist's C7 banner already draws one seam
// over ("`is TriageCommand.SetPriority ->` is a MATCH and stays legal
// everywhere; `TriageCommand.SetPriority(` is a CONSTRUCTION and does not").
// Here: `case "PageOncall":`, `e.kind === "PageOncall"` and the TYPE position
// `readonly kind: "PageOncall"` are matches and stay legal everywhere. Naming
// the leaf as a VALUE — in an object literal, behind a computed key, through a
// shorthand binding, or as the target of an `as` assertion — is a construction,
// and it is denied outside the leaf's own pinned site.
//
// FOUR SPELLINGS, EACH DENIED SEPARATELY, and the alias one is why the census
// resolves names from each FILE'S OWN import list rather than from a frozen
// name table: `import type { PageOncall as P }` then `x as P` is the mechanic
// that defeats every name-keyed selector, so the local alias is what is matched.
//
// NAMED RESIDUE, in the C4_SHAPE tradition of writing down what a rule cannot
// see. This denies naming the leaf; it does not deny COPYING one that already
// exists (`{ ...page, ticket: other }` carries the class without spelling it,
// and needs a page in hand, which only the pinned site can produce). Nor can any
// static rule here deny an `any`. What it earns is "the leaf cannot be
// CONSTRUCTED outside its site", never "an Irreversible effect cannot exist".

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** One Irreversible effect leaf, as the contracts declare it. */
export interface Leaf {
  /** the `kind` discriminant, e.g. "PageOncall" */
  readonly kind: string;
  /** the interface name — usually the same word, but derived separately */
  readonly name: string;
  /** the normalised path of the contract that declares it */
  readonly declaredIn: string;
}

export interface C17Violation {
  readonly path: string;
  readonly message: string;
}

/** One leaf's licence: WHERE it may be constructed, and HOW MANY TIMES there. */
export interface Site {
  readonly file: string;
  readonly constructions: number;
}

/**
 * THE PINNED SITE ROSTER, declared as DATA beside the check.
 *
 * One entry per Irreversible leaf: the file whose arm is allowed to construct it,
 * and the NUMBER of constructions that file is allowed to hold. A leaf with NO
 * entry is constructible nowhere, which is the fail-closed direction.
 *
 * THE COUNT IS THE HALF THAT MATTERS, and it is what a per-file roster alone
 * cannot do. `blocks/escalation/fold.ts` registers BOTH a Reversible verb
 * (`requestEscalation`) and an Irreversible one (`confirmEscalation`) into one
 * arm, so a file-level licence would let the Reversible branch construct a page —
 * the exact shape docs/DECISIONS.md:86 names — inside the one file the rule has
 * to allow. Pinning the count closes that: a second construction appearing in
 * that file is a red diff, wherever in the file it sits.
 *
 * Moving or adding a construction is therefore a deliberate edit HERE with a
 * reason beside it, never a rule quietly loosened.
 */
export const SITES: Readonly<Record<string, Site>> = {
  // the Irreversible verb `confirmEscalation`'s own success branch — once
  PageOncall: { file: "blocks/escalation/fold.ts", constructions: 1 },
  // the Irreversible verb `confirmSeal`'s own success branch — once, at seal time
  DeliverArtifact: { file: "blocks/artifact/fold.ts", constructions: 1 },
};

/** Every production `.ts` under `<root>/src`, normalised to a path relative to
 *  `<root>/src`. TESTS ARE OUT OF SCOPE, deliberately: a test's job is to
 *  CONSTRUCT the transport it feeds to an arm, and the probes that prove the
 *  admission rule refuses build exactly the shape this check denies. */
export function productionFiles(root: string): string[] {
  const base = join(root, "src");
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel);
        continue;
      }
      if (rel.endsWith(".ts") && !rel.endsWith(".test.ts")) out.push(rel);
    }
  };
  walk(base, "");
  return out.sort();
}

const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

/** The literal type `"X"` a property signature declares, or null. */
function literalTypeOf(member: ts.TypeElement, name: string): string | null {
  if (!ts.isPropertySignature(member) || member.type === undefined) return null;
  if (!ts.isIdentifier(member.name) || member.name.text !== name) return null;
  const type = member.type;
  if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) return null;
  return type.literal.text;
}

/**
 * THE DERIVATION. Every interface that extends `EffectBase` and narrows
 * `effectClass` to the literal `"Irreversible"`, with the `kind` it declares.
 */
export function irreversibleLeaves(root: string): Leaf[] {
  const leaves: Leaf[] = [];
  for (const rel of productionFiles(root)) {
    if (!rel.endsWith("contract.ts")) continue;
    const source = parse(rel, readFileSync(join(root, "src", rel), "utf8"));
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      const extendsBase = (statement.heritageClauses ?? []).some((clause) =>
        clause.types.some((t) => t.expression.getText(source) === "EffectBase"),
      );
      if (!extendsBase) continue;
      const cls = statement.members
        .map((m) => literalTypeOf(m, "effectClass"))
        .find((v) => v !== null);
      if (cls !== "Irreversible") continue;
      const kind = statement.members.map((m) => literalTypeOf(m, "kind")).find((v) => v !== null);
      if (kind === undefined || kind === null) continue;
      leaves.push({ kind, name: statement.name.text, declaredIn: rel });
    }
  }
  return leaves.sort((a, b) => a.kind.localeCompare(b.kind));
}

/** THIS FILE'S OWN in-scope spellings of each leaf TYPE — every local name an
 *  `import { X as Y }` or `import * as N` put in scope. Resolved per file, so a
 *  rename cannot walk past the check (mechanic #10). */
function localTypeNames(source: ts.SourceFile, leaf: Leaf): Set<string> {
  const names = new Set<string>([leaf.name]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const bindings = statement.importClause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      // `import * as C from "./contract"` — `C.PageOncall`, matched on the
      // rightmost identifier of the qualified name below.
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === leaf.name) names.add(element.name.text);
    }
  }
  return names;
}

/** The rightmost identifier of a (possibly qualified) type name. */
function rightmost(node: ts.TypeNode): string | null {
  if (!ts.isTypeReferenceNode(node)) return null;
  const name = node.typeName;
  return ts.isQualifiedName(name) ? name.right.text : name.text;
}

/** Is this string literal a MATCH rather than a construction? */
function isMatchPosition(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isCaseClause(parent)) return true;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    return (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  // A computed KEY (`{ ["kind"]: … }`) is not the leaf's own name and is handled
  // by C7's computed-key FORM denial; a computed key spelling the LEAF is caught
  // by the leaf-name clause because the leaf name still appears as a value.
  return false;
}

/** The property name of an object-literal assignment, computed or not. */
function propertyName(node: ts.ObjectLiteralElementLike): string | null {
  const name = node.name;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return null;
}

/**
 * THE CENSUS. Every construction of an Irreversible leaf outside its pinned
 * site, in the four spellings a TypeScript author has.
 */
export function c17Violations(
  root: string,
  sites: Readonly<Record<string, Site>> = SITES,
): C17Violation[] {
  const leaves = irreversibleLeaves(root);
  const anySite = new Set(Object.values(sites).map((s) => s.file));
  const problems: C17Violation[] = [];

  for (const rel of productionFiles(root)) {
    const source = parse(rel, readFileSync(join(root, "src", rel), "utf8"));
    const aliases = new Map(leaves.map((leaf) => [leaf.kind, localTypeNames(source, leaf)]));
    /** how many constructions of each leaf this file actually holds */
    const seen = new Map<string, number>();
    let classSpelled = 0;

    const visit = (node: ts.Node): void => {
      // (1) the leaf named as a VALUE — a string literal in any non-match
      //     position. This is the clause a shorthand binding cannot walk past:
      //     `const kind = "PageOncall"; return { kind, … }` still spells it.
      if (ts.isStringLiteralLike(node) && !isMatchPosition(node)) {
        for (const leaf of leaves) {
          if (node.text !== leaf.kind) continue;
          seen.set(leaf.kind, (seen.get(leaf.kind) ?? 0) + 1);
          if (sites[leaf.kind]?.file === rel) continue;
          problems.push({
            path: rel,
            message: `[C17] constructs the Irreversible effect leaf \`${leaf.kind}\`; its only pinned site is \`${sites[leaf.kind]?.file ?? "(none)"}\``,
          });
        }
      }
      // (2) `effectClass: "Irreversible"` — the property every construction of
      //     an Irreversible leaf is FORCED to spell, because the literal type
      //     leaves no other way to satisfy the interface.
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          if (propertyName(property) !== "effectClass") continue;
          const value = property.initializer;
          if (!ts.isStringLiteralLike(value) || value.text !== "Irreversible") continue;
          classSpelled += 1;
          if (anySite.has(rel)) continue;
          problems.push({
            path: rel,
            message:
              "[C17] constructs an `Irreversible`-class effect outside every pinned site — the class is earned by the verb whose arm emits it",
          });
        }
      }
      // (3) an `as` assertion to a leaf type, under any LOCAL name the file's
      //     own imports put in scope. This is the double-assertion spelling
      //     (`{} as unknown as PageOncall`) and the aliased-import spelling.
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        const named = rightmost(node.type);
        if (named !== null) {
          for (const leaf of leaves) {
            if (!(aliases.get(leaf.kind)?.has(named) ?? false)) continue;
            if (sites[leaf.kind]?.file === rel) continue;
            problems.push({
              path: rel,
              message: `[C17] asserts a value into the Irreversible effect leaf \`${leaf.kind}\` (as \`${named}\`); its only pinned site is \`${sites[leaf.kind]?.file ?? "(none)"}\``,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    // THE COUNT HALF. A pinned site holds EXACTLY the constructions the roster
    // grants it — so a second one, appearing anywhere in the file including the
    // Reversible verb's own branch, is a red diff rather than a licence the file
    // already held (docs/DECISIONS.md:86).
    const allowed = Object.entries(sites).filter(([, site]) => site.file === rel);
    for (const [kind, site] of allowed) {
      const held = seen.get(kind) ?? 0;
      if (held !== site.constructions) {
        problems.push({
          path: rel,
          message: `[C17] this site is pinned to ${site.constructions} construction(s) of \`${kind}\` and holds ${held} — a second one in a Reversible verb's branch is the shape the roster exists to deny`,
        });
      }
    }
    const grantedClasses = allowed.reduce((n, [, site]) => n + site.constructions, 0);
    if (allowed.length > 0 && classSpelled !== grantedClasses) {
      problems.push({
        path: rel,
        message: `[C17] this site is pinned to ${grantedClasses} \`effectClass: "Irreversible"\` spelling(s) and holds ${classSpelled}`,
      });
    }
  }
  return problems;
}
