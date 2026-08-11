/**
 * Read one URL search param against a closed set, falling back when it is absent,
 * repeated, or not a member.
 *
 * A search param is untrusted input: `?tab=<script>` and `?tab=a&tab=b` both reach
 * a page as something other than the union its types promise. Narrowing through the
 * allowed list is what makes the return type honest.
 */
export function parseParam<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.find((value) => value === raw) ?? fallback
}
