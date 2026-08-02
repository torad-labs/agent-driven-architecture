// BLOCK-TEST C4 (G1), second half — a PURE TOOL names the stamp.
// A tool asking "who is asking?" is asking the wrong question: it runs at step 3
// of the boundary's nine, and the signature is not minted until step 4. There is
// nothing truthful for it to read.
package adr.blocks.escalation

import adr.spine.pure.Authority
import adr.spine.pure.Signature

fun whoIsAsking(sig: Signature): Authority = sig.authority
