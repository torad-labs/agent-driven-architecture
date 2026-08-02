// ALLOW-TEST for the suppression lock: a @Suppress of a NON-gate rule stays legal.
// The lock is scoped to the gate's own rules (15.2) — a blanket annotation ban
// would be the nuisance authors turn off.
package fixture.compliant.blocks.triage

@Suppress("unused")
fun quiet(): Int = 3
