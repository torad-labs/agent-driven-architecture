// BLOCK-TEST for the suppression lock (15.2). The annotation below is the whole
// violation: a builder silencing a gate rule from inside the tree it defends.
// ForbiddenSuppress reports the @Suppress ITSELF — the finding does not depend on
// the suppressed rule managing to fire through its own gag.
package fixture.violating.blocks.triage

@Suppress("ForbiddenMethodCall")
fun silencedClock(): Long = java.lang.System.currentTimeMillis()
