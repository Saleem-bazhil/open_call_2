import { query } from "../../config/database.js";
import {
  countByRegionAndEvent,
  lastEventTimestampsByRegion,
  listActivity,
  type ActivityRow,
} from "../../repositories/activityLogRepository.js";
import { listRegions, type Region } from "../../repositories/regionRepository.js";
import type { UserRole } from "@opencall/shared";

export interface MonitoringDashboardSummary {
  activeRegions: number;
  totalRegions: number;
  totalActiveUsers: number;
  totalReports30d: number;
  totalPendingManualEntries: number;
}

export interface RegionDashboardEntry {
  regionId: string | null;
  regionCode: string;
  regionName: string;
  regionIsActive: boolean;
  activeUserCount: number;
  recentLoginCount24h: number;
  reportCount30d: number;
  failedBatchCount30d: number;
  pendingManualEntries: number;
  lastLoginAt: string | null;
  lastUploadAt: string | null;
  lastReportGeneratedAt: string | null;
  rtplMetrics: Array<{ rtplStatus: string; count: number }>;
}

export interface RecentLoginRow {
  userId: string;
  username: string | null;
  email: string;
  role: UserRole;
  regionId: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
}

export interface RecentUploadRow {
  batchId: string;
  originalFileName: string;
  sourceType: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  rowCount: number;
  errorCount: number;
  createdAt: string;
  regionId: string | null;
}

export interface RecentReportRow {
  reportId: string;
  reportDate: string;
  totalRows: number;
  duplicateTicketCount: number;
  unmatchedTicketCount: number;
  createdAt: string;
  regionId: string | null;
}

export interface MonitoringDashboard {
  generatedAt: string;
  summary: MonitoringDashboardSummary;
  regions: RegionDashboardEntry[];
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ActiveUserCountRow {
  region_id: string | null;
  count: string;
}

interface PendingManualRow {
  region_id: string | null;
  count: string;
}

interface RtplRow {
  region_id: string | null;
  rtpl_status: string;
  count: string;
}

interface RecentLoginDb {
  id: string;
  username: string | null;
  email: string;
  role: UserRole;
  region_id: string | null;
  last_login_at: string | null;
  is_active: boolean;
}

interface RecentUploadDb {
  id: string;
  original_file_name: string;
  source_type: "FLEX_WIP" | "RENDERWAYS" | "CALL_PLAN";
  status: "UPLOADED" | "VALIDATED" | "FAILED" | "PROCESSED";
  row_count: number;
  error_count: number;
  created_at: string;
  region_id: string | null;
}

interface RecentReportDb {
  id: string;
  report_date: string;
  total_rows: number;
  duplicate_ticket_count: number;
  unmatched_ticket_count: number;
  created_at: string;
  region_id: string | null;
}

async function fetchActiveUserCounts(): Promise<Map<string | null, number>> {
  const result = await query<ActiveUserCountRow>(
    `
      SELECT region_id, COUNT(*)::TEXT AS count
      FROM users
      WHERE is_active = TRUE
      GROUP BY region_id
    `,
  );
  const map = new Map<string | null, number>();
  for (const row of result.rows) {
    map.set(row.region_id, Number(row.count));
  }
  return map;
}

async function fetchFailedBatchCounts(since: string): Promise<Map<string | null, number>> {
  const result = await query<{ region_id: string | null; count: string }>(
    `
      SELECT region_id, COUNT(*)::TEXT AS count
      FROM source_upload_batches
      WHERE status = 'FAILED' AND created_at >= $1::timestamptz
      GROUP BY region_id
    `,
    [since],
  );
  const map = new Map<string | null, number>();
  for (const row of result.rows) {
    map.set(row.region_id, Number(row.count));
  }
  return map;
}

async function fetchPendingManualCounts(): Promise<Map<string | null, number>> {
  const result = await query<PendingManualRow>(
    `
      SELECT reports.region_id, COUNT(*)::TEXT AS count
      FROM daily_call_plan_report_rows rows
      JOIN daily_call_plan_reports reports ON reports.id = rows.report_id
      WHERE rows.manual_fields_completed = FALSE
      GROUP BY reports.region_id
    `,
  );
  const map = new Map<string | null, number>();
  for (const row of result.rows) {
    map.set(row.region_id, Number(row.count));
  }
  return map;
}

async function fetchRtplBreakdown(): Promise<Map<string | null, Array<{ rtplStatus: string; count: number }>>> {
  const result = await query<RtplRow>(
    `
      WITH latest_report AS (
        SELECT DISTINCT ON (region_id) id, region_id
        FROM daily_call_plan_reports
        ORDER BY region_id, created_at DESC
      )
      SELECT
        latest_report.region_id,
        COALESCE(NULLIF(TRIM(rows.rtpl_status), ''), 'Manual Entry Required') AS rtpl_status,
        COUNT(*)::TEXT AS count
      FROM latest_report
      JOIN daily_call_plan_report_rows rows ON rows.report_id = latest_report.id
      GROUP BY latest_report.region_id, rtpl_status
      ORDER BY latest_report.region_id, count DESC
    `,
  );
  const map = new Map<string | null, Array<{ rtplStatus: string; count: number }>>();
  for (const row of result.rows) {
    const list = map.get(row.region_id) ?? [];
    list.push({ rtplStatus: row.rtpl_status, count: Number(row.count) });
    map.set(row.region_id, list);
  }
  return map;
}

async function fetchRecentLogins(limit: number): Promise<RecentLoginRow[]> {
  const result = await query<RecentLoginDb>(
    `
      SELECT id, username, email, role, region_id, last_login_at::TEXT, is_active
      FROM users
      WHERE last_login_at IS NOT NULL
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    userId: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    regionId: row.region_id,
    lastLoginAt: row.last_login_at,
    isActive: Boolean(row.is_active),
  }));
}

async function fetchRecentUploads(limit: number): Promise<RecentUploadRow[]> {
  const result = await query<RecentUploadDb>(
    `
      SELECT id, original_file_name, source_type, status,
             row_count, error_count, created_at::TEXT, region_id
      FROM source_upload_batches
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    batchId: row.id,
    originalFileName: row.original_file_name,
    sourceType: row.source_type,
    status: row.status,
    rowCount: row.row_count,
    errorCount: row.error_count,
    createdAt: row.created_at,
    regionId: row.region_id,
  }));
}

async function fetchRecentReports(limit: number): Promise<RecentReportRow[]> {
  const result = await query<RecentReportDb>(
    `
      SELECT id, report_date::TEXT, total_rows,
             duplicate_ticket_count, unmatched_ticket_count,
             created_at::TEXT, region_id
      FROM daily_call_plan_reports
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    reportId: row.id,
    reportDate: row.report_date,
    totalRows: row.total_rows,
    duplicateTicketCount: row.duplicate_ticket_count,
    unmatchedTicketCount: row.unmatched_ticket_count,
    createdAt: row.created_at,
    regionId: row.region_id,
  }));
}

function buildRegionEntry(
  region: Region,
  activeUsers: Map<string | null, number>,
  failedBatches: Map<string | null, number>,
  pendingManual: Map<string | null, number>,
  rtpl: Map<string | null, Array<{ rtplStatus: string; count: number }>>,
  loginCounts24h: Map<string | null, number>,
  reportCounts30d: Map<string | null, number>,
  lastEvents: Map<string | null, { lastLogin: string | null; lastUpload: string | null; lastReport: string | null }>,
): RegionDashboardEntry {
  const evt = lastEvents.get(region.id);
  return {
    regionId: region.id,
    regionCode: region.code,
    regionName: region.name,
    regionIsActive: region.isActive,
    activeUserCount: activeUsers.get(region.id) ?? 0,
    recentLoginCount24h: loginCounts24h.get(region.id) ?? 0,
    reportCount30d: reportCounts30d.get(region.id) ?? 0,
    failedBatchCount30d: failedBatches.get(region.id) ?? 0,
    pendingManualEntries: pendingManual.get(region.id) ?? 0,
    lastLoginAt: evt?.lastLogin ?? null,
    lastUploadAt: evt?.lastUpload ?? null,
    lastReportGeneratedAt: evt?.lastReport ?? null,
    rtplMetrics: rtpl.get(region.id) ?? [],
  };
}

export async function buildMonitoringDashboard(options: {
  recentLimit?: number;
}): Promise<MonitoringDashboard> {
  const now = new Date();
  const since30d = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
  const since24h = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const recentLimit = Math.min(Math.max(options.recentLimit ?? 10, 1), 50);

  const [
    regions,
    activeUsers,
    failedBatches,
    pendingManual,
    rtpl,
    counts30d,
    counts24h,
    lastEventsRows,
    recentLogins,
    recentUploads,
    recentReports,
  ] = await Promise.all([
    listRegions(),
    fetchActiveUserCounts(),
    fetchFailedBatchCounts(since30d),
    fetchPendingManualCounts(),
    fetchRtplBreakdown(),
    countByRegionAndEvent(since30d),
    countByRegionAndEvent(since24h),
    lastEventTimestampsByRegion(),
    fetchRecentLogins(recentLimit),
    fetchRecentUploads(recentLimit),
    fetchRecentReports(recentLimit),
  ]);

  const reportCounts30d = new Map<string | null, number>();
  for (const row of counts30d) {
    if (row.eventType === "REPORT_GENERATED") {
      reportCounts30d.set(row.regionId, (reportCounts30d.get(row.regionId) ?? 0) + row.count);
    }
  }
  const loginCounts24h = new Map<string | null, number>();
  for (const row of counts24h) {
    if (row.eventType === "LOGIN_SUCCESS") {
      loginCounts24h.set(row.regionId, (loginCounts24h.get(row.regionId) ?? 0) + row.count);
    }
  }
  const lastEvents = new Map<string | null, { lastLogin: string | null; lastUpload: string | null; lastReport: string | null }>();
  for (const row of lastEventsRows) {
    lastEvents.set(row.regionId, {
      lastLogin: row.lastLoginAt,
      lastUpload: row.lastUploadAt,
      lastReport: row.lastReportAt,
    });
  }

  const regionEntries = regions.map((region) =>
    buildRegionEntry(
      region,
      activeUsers,
      failedBatches,
      pendingManual,
      rtpl,
      loginCounts24h,
      reportCounts30d,
      lastEvents,
    ),
  );

  let totalActiveUsers = 0;
  for (const count of activeUsers.values()) {
    totalActiveUsers += count;
  }
  const totalReports30d = Array.from(reportCounts30d.values()).reduce((a, b) => a + b, 0);
  let totalPendingManualEntries = 0;
  for (const count of pendingManual.values()) {
    totalPendingManualEntries += count;
  }

  return {
    generatedAt: now.toISOString(),
    summary: {
      activeRegions: regions.filter((r) => r.isActive).length,
      totalRegions: regions.length,
      totalActiveUsers,
      totalReports30d,
      totalPendingManualEntries,
    },
    regions: regionEntries,
    recentLogins,
    recentUploads,
    recentReports,
  };
}

export interface RegionDrillDown {
  region: RegionDashboardEntry;
  recentLogins: RecentLoginRow[];
  recentUploads: RecentUploadRow[];
  recentReports: RecentReportRow[];
  recentActivity: ActivityRow[];
}

export async function buildRegionDrillDown(
  regionId: string,
  options: { limit?: number },
): Promise<RegionDrillDown | null> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const dashboard = await buildMonitoringDashboard({ recentLimit: limit });
  const region = dashboard.regions.find((entry) => entry.regionId === regionId);
  if (!region) {
    return null;
  }
  const recentLogins = dashboard.recentLogins.filter((row) => row.regionId === regionId);
  const recentUploads = dashboard.recentUploads.filter((row) => row.regionId === regionId);
  const recentReports = dashboard.recentReports.filter((row) => row.regionId === regionId);
  const { rows: recentActivity } = await listActivity({
    regionId,
    limit,
  });
  return {
    region,
    recentLogins,
    recentUploads,
    recentReports,
    recentActivity,
  };
}
