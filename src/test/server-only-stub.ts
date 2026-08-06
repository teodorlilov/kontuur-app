/**
 * Stub for the `server-only` guard under vitest.
 *
 * `server-only` is not a real dependency — Next aliases it internally, and its
 * whole job is to fail the *bundler* if a server module is pulled into a client
 * bundle. Vitest has no such bundle split, so it just needs the import to
 * resolve. Aliased in vitest.config.ts.
 */
export {}
