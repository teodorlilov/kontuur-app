import type { z } from 'zod'

/**
 * Flattens a ZodError into `path: message` lines.
 *
 * Zod's own flatten()/format() preserve the nested shape; boundary logs and the
 * `issues` arrays the safeParse helpers return both want one flat line per problem.
 *
 * Lives here rather than in `lib/validation.ts` on purpose: that module is
 * imported by the auth forms and other client components, and must stay free of
 * zod so the library does not re-enter their bundles (see TECH-DEBT 5.2).
 */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}
