import type { RequestHandler } from "express";
import {
  requireCurrentUser,
} from "../services/rbac/regionAccessService.js";
import { updateReportRowManualFields, deleteReportRowService } from "../services/reportRows/reportRowEditService.js";
import { recordActivity } from "../services/audit/activityLogger.js";
import type { ReportRowEditInput } from "../services/reportRows/reportRowEditService.js";
import { listRtplStatusChanges } from "../repositories/activityLogRepository.js";
import { findRegionById } from "../repositories/regionRepository.js";
import { aspCodesForRegion } from "../services/rbac/regionRowAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest, forbidden } from "../utils/httpError.js";
import { reportRowEditRequestSchema } from "../validators/reportRowEditRequestValidator.js";

function firstQueryString(value: unknown): string {
  if (Array.isArray(value)) {
    return firstQueryString(value[0]);
  }

  return typeof value === "string" ? value.trim() : "";
}

function todayIstDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const partValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function parseRtplChangeDate(value: unknown): string {
  const rawDate = firstQueryString(value);

  if (!rawDate) {
    return todayIstDate();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);

  if (!match) {
    throw badRequest("Invalid RTPL change date. Use YYYY-MM-DD.");
  }

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw badRequest("Invalid RTPL change date. Use YYYY-MM-DD.");
  }

  return rawDate;
}

export const updateReportRowController: RequestHandler = asyncHandler(
  async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const rowId = request.params.id?.trim();

    if (!rowId) {
      throw badRequest("Missing report row id");
    }

    const parsedValues = reportRowEditRequestSchema.parse(request.body);
    const values = Object.fromEntries(
      Object.entries(parsedValues).filter(([, value]) => value !== undefined),
    ) as ReportRowEditInput;
    const row = await updateReportRowManualFields({
      rowId,
      user: currentUser,
      values,
    });

    recordActivity({
      eventType: "REPORT_ROW_EDITED",
      actor: {
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
      },
      regionId: row.regionId ?? currentUser.regionId ?? null,
      targetType: "report_row",
      targetId: row.id,
      metadata: {
        reportId: row.reportId,
        serialNo: row.serialNo,
        ticketId: row.ticketId,
        caseId: row.caseId,
        workLocation: row.workLocation,
        changedFields: Object.keys(values),
        ...(row.rtplStatusChange
          ? {
              rtplStatusChange: {
                fromStatus: row.rtplStatusChange.fromStatus,
                toStatus: row.rtplStatusChange.toStatus,
              },
            }
          : {}),
      },
      request,
    });

    response.json({
      data: row,
    });
  },
);

export const listRtplStatusChangesController: RequestHandler = asyncHandler(
  async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const reportId = String(request.query.reportId ?? "").trim();
    const parsedLimit = Number(request.query.limit ?? 50);
    const changeDate = parseRtplChangeDate(
      request.query.changeDate ?? request.query.reportDate,
    );

    if (!reportId) {
      throw badRequest("Missing report id");
    }

    let regionId: string | null | undefined;
    let workLocationCodes: string[] | undefined;

    if (currentUser.role === "REGION_ADMIN") {
      if (!currentUser.regionId) {
        throw forbidden("REGION_ADMIN user is not assigned to a region");
      }

      const region = await findRegionById(currentUser.regionId);
      if (!region) {
        throw forbidden("REGION_ADMIN user's region was not found", {
          userRegionId: currentUser.regionId,
        });
      }

      regionId = currentUser.regionId;
      workLocationCodes = Array.from(aspCodesForRegion(region));
    }

    const changes = await listRtplStatusChanges({
      reportId,
      changeDate,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      ...(regionId ? { regionId } : {}),
      ...(workLocationCodes ? { workLocationCodes } : {}),
    });

    response.json({
      data: changes,
    });
  },
);

export const deleteReportRowController: RequestHandler = asyncHandler(
  async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const rowId = request.params.id?.trim();

    if (!rowId) {
      throw badRequest("Missing report row id");
    }

    await deleteReportRowService({
      rowId,
      user: currentUser,
    });

    response.json({
      success: true,
    });
  },
);
