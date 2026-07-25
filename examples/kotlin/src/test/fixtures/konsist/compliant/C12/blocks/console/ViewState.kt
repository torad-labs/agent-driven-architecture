// Support for the C12 ALLOW-test: the identical ephemeral state, so the rule is
// genuinely exercised rather than merely absent.
package adr.blocks.console

data class ViewState(val hover: String?, val scrollOffset: Int, val draft: String)
