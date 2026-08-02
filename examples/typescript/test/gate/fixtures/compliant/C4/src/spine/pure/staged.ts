// ALLOW-TEST C4 — the staged input as the book ships it: a source, a body, a
// key. No stamp, no field that could hold one.
export interface Recalled {
  readonly kind: "Recalled";
  readonly text: string;
  readonly publishedAt: number | null;
}
