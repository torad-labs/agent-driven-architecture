// VIOLATION: F2/D4, fourth half — THE DECLARING-FILE ESCAPES. The one file
// that declares the class needs no import to hold the constructor, so the
// import denial (C4_MINT) never fires here and each declaration-form
// republication below must be denied by shape, not by import path.
export class Signature {
  constructor(
    readonly by: string,
    readonly authority: string,
  ) {}
}

// the alias spelling — rebinds the constructor under a fresh name
export const Stamp = Signature;

// the default spelling — republishes it under the one name no import rule sees
export default Signature;

// the subclass spelling — a second constructor whose instances pass every
// check on the first
export class Forged extends Signature {}
