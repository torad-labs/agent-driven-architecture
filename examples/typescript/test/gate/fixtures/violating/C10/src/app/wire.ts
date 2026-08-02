// VIOLATION: G7 — a service locator by another name.
let cachedRegistry: unknown = null;
export const get = () => cachedRegistry;
