#!/usr/bin/env bun
/**
 * Verify the pre-commit hook is INSTALLED, not merely written.
 *
 * `core.hooksPath` is local git config and cannot be checked in, so a fresh clone has the staged
 * gate present and inert. That is the state this repository was in for a day: staged.ts existed,
 * `bun run gate` did not call it, `.git/hooks/` was empty, and CI skipped it while the workflow
 * described it as "a pre-commit tool". A gate that is written but not wired reads as coverage.
 */
// CI has no commits to make, so a pre-commit hook there is meaningless. Skipping is honest;
// asserting it would be a check that measures the runner rather than the repository.
if (process.env["CI"] === "true" || process.env["GITHUB_ACTIONS"] === "true") {
  console.log("hookpath: skipped in CI (no local commits are made here)");
  process.exit(0);
}

const configured = (await Bun.$`git config core.hooksPath`.quiet().nothrow().text()).trim();

if (configured === "dev/githooks") {
  console.log("hookpath: pre-commit installed (core.hooksPath = dev/githooks)");
  process.exit(0);
}

console.error(
  `hookpath: the staged-content gate is NOT installed.\n\n` +
    `  core.hooksPath is ${configured === "" ? "unset" : `"${configured}"`}, expected "dev/githooks".\n\n` +
    `  Install it (once per clone — git config is not checked in):\n` +
    `      git config core.hooksPath dev/githooks\n\n` +
    `  Without it dev/gates/staged.ts never runs locally, and content can reach a commit by any\n` +
    `  route PreToolUse did not see.`,
);
process.exit(1);
