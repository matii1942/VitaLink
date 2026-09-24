/**
 * Small pieces of query-string handling shared by the list endpoints.
 */

/** The two directions a list can be sorted in. Used with Nest's ParseEnumPipe. */
export const SortOrder = {
  asc: 'asc',
  desc: 'desc',
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

/**
 * A text filter that is actually present.
 *
 * `?ward=` and `?ward=%20` arrive as a string, so a filter built straight from
 * the query would search for a ward called "" and find nothing. An absent
 * filter and an empty one mean the same thing to a caller: no filter.
 */
export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}
