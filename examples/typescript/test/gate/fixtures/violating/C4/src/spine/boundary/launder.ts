// VIOLATION: G1, fourth half — THE REBINDING TWO-HOP, authored INSIDE the
// one folder C4_MINT exempts. The exemption is a folder, so this file may bind
// the constructor; renaming it on the way out then produces a binding that
// `importNames: ["Signature"]` cannot see anywhere downstream, and
// `local.name="Signature"` cannot see here. Denying the whole form is the
// price of the exemption: the folder that mints publishes no value binding.
import { Signature as S } from "../pure/actor";

export { S };
