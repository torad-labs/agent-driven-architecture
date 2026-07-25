// Support for the C12 fixture: the ephemeral state 4.6 carves out. Hover, scroll
// offset, which panel is expanded in THIS browser tab, unsubmitted text.
package adr.blocks.console

data class ViewState(val hover: String?, val scrollOffset: Int, val draft: String)
