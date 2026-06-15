/**
 * Pure helper for the per-ticket "consecutive days Flex Status unchanged" counter.
 *
 * The counter answers: how many consecutive report-days (including today) has a
 * ticket's Flex Status held the same value?
 *
 * Semantics:
 * - No previous report at all (`hadPreviousReport === false`) => `null` (unknown;
 *   today is the first observation and we cannot assert a streak).
 * - Previous report exists but this ticket was not present previously
 *   (`previousFlexStatus === undefined`) => `1` (today is day 1 for this ticket).
 * - Previous report exists, ticket matched, and the Flex Status is unchanged
 *   => previous count + 1. A previous count of `null`/`0` (e.g. column not yet
 *   backfilled) is treated as `1`, so two consecutive same-status days read as `2`.
 * - Previous report exists, ticket matched, but the Flex Status changed => `1`
 *   (today resets the streak).
 */

export interface ComputeFlexStatusUnchangedDaysInput {
  /** Today's Flex Status for the ticket (raw value, may be null/blank). */
  currentFlexStatus: string | null;
  /**
   * The matched previous report's Flex Status. `undefined` means the ticket was
   * not present in the previous report (new ticket); `null` means it was present
   * with a blank Flex Status.
   */
  previousFlexStatus: string | null | undefined;
  /** The persisted streak count from the previous report row (if any). */
  previousCount: number | null | undefined;
  /** Whether a previous report exists at all for this region/date window. */
  hadPreviousReport: boolean;
}

function normalizeFlexStatus(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function computeFlexStatusUnchangedDays(
  input: ComputeFlexStatusUnchangedDaysInput,
): number | null {
  // No previous report exists at all: the streak is unknown.
  if (!input.hadPreviousReport) {
    return null;
  }

  // Previous report exists but this ticket is new today.
  if (input.previousFlexStatus === undefined) {
    return 1;
  }

  const current = normalizeFlexStatus(input.currentFlexStatus);
  const previous = normalizeFlexStatus(input.previousFlexStatus);

  // Flex Status changed today (treating blank-vs-value as a change): reset.
  if (current !== previous) {
    return 1;
  }

  // Unchanged: accumulate. A missing/zero previous count counts as 1 day so two
  // consecutive same-status reads produce 2.
  const previousCount =
    input.previousCount && input.previousCount > 0 ? input.previousCount : 1;
  return previousCount + 1;
}
