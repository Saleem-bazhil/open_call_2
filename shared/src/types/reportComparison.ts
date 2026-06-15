export const REPORT_CHANGE_TYPES = [
  "NEW",
  "CLOSED",
  "CARRIED",
  "UPDATED",
] as const;

export type ReportChangeType = (typeof REPORT_CHANGE_TYPES)[number];

export const REPORT_COMPARISON_FIELDS = [
  "flex_status",
  "rtpl_status",
  "wip_aging",
  "wip_aging_category",
  "tat",
  "engineer",
  "location",
] as const;

export type ReportComparisonField = (typeof REPORT_COMPARISON_FIELDS)[number];

export type ComparableReportValue = string | null;

export interface ReportFieldChange {
  from: ComparableReportValue;
  to: ComparableReportValue;
}

export type ReportChangedFields = Partial<
  Record<ReportComparisonField, ReportFieldChange>
>;

export interface ReportComparisonSummary {
  total_tickets: number;
  new_count: number;
  closed_count: number;
  updated_count: number;
  carried_count: number;
}

export interface ReportRowComparisonInsight {
  changeType: ReportChangeType | null;
  previousFlexStatus: string | null;
  previousRtplStatus: string | null;
  previousWipAging: string | null;
  changedFields: ReportChangedFields;
  changeSummary: string | null;
  /**
   * Number of consecutive report-days (including today) the ticket's Flex Status
   * has stayed the same value. `null` when there is no previous report at all
   * (unknown); `1` when there is a previous report but this ticket is new or its
   * status changed today.
   */
  flexStatusUnchangedDays: number | null;
}

export interface ReportRowDiff {
  id: string;
  ticketId: string;
  currentSessionId: string;
  previousSessionId: string;
  changeType: ReportChangeType;
  changedFields: ReportChangedFields;
  createdAt: string;
}

export interface ReportComparison {
  id: string;
  currentSessionId: string;
  previousSessionId: string;
  summary: ReportComparisonSummary;
  createdAt: string;
}
