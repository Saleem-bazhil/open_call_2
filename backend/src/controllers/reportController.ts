import type { RequestHandler } from "express";
import { ASP_CODE_REGION_MAP } from "@opencall/shared";
import { findRegionById, type Region } from "../repositories/regionRepository.js";
import { generateDailyCallPlanReport } from "../services/callPlanGenerator/dailyCallPlanGenerator.js";
import {
  requireCurrentUser,
  resolveEffectiveRegionId,
} from "../services/rbac/regionAccessService.js";
import type { GeneratedDailyCallPlanReport } from "../types/reportGeneration.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { reportGenerationRequestSchema } from "../validators/reportGenerationRequestValidator.js";

function aspCodesForRegion(region: Region): Set<string> {
  const wanted = new Set<string>();
  const regionCodeUpper = region.code.trim().toUpperCase();
  const regionNameUpper = region.name.trim().toUpperCase();

  // 1. Direct match: regions.code is the ASP code (e.g. "ASPS01463")
  if (regionCodeUpper) {
    wanted.add(regionCodeUpper);
  }

  // 2. Reverse lookup: regions.code or regions.name is the canonical region name
  //    ("VELLORE", "CHENNAI", ...). Find every ASP code that maps to it.
  for (const [aspCode, regionName] of Object.entries(ASP_CODE_REGION_MAP)) {
    const canonicalName = regionName.trim().toUpperCase();
    if (canonicalName === regionNameUpper || canonicalName === regionCodeUpper) {
      wanted.add(aspCode.toUpperCase());
    }
  }

  return wanted;
}

function filterReportForRegion(
  report: GeneratedDailyCallPlanReport,
  region: Region,
): GeneratedDailyCallPlanReport {
  const wantedCodes = aspCodesForRegion(region);
  const filteredRows = report.rows.filter((row) => {
    const aspCode = String(
      row.output["Work Location"] ?? row.enriched.work_location ?? "",
    )
      .trim()
      .toUpperCase();
    return wantedCodes.has(aspCode);
  });
  const filteredRegionBreakdown = report.regionBreakdown.filter((entry) =>
    wantedCodes.has(entry.aspCode.toUpperCase()),
  );
  return {
    ...report,
    rows: filteredRows,
    totalRows: filteredRows.length,
    regionBreakdown: filteredRegionBreakdown,
  };
}


export const generateDailyCallPlanReportController: RequestHandler =
  asyncHandler(async (request, response) => {
    const currentUser = requireCurrentUser(request.currentUser);
    const body = reportGenerationRequestSchema.parse({
      ...request.body,
      generatedBy: currentUser.id,
      regionId: request.header("x-region-id") ?? request.body.regionId ?? null,
    });
    const regionId = resolveEffectiveRegionId(
      currentUser,
      body.regionId ?? null,
    );
    const isRegionAdmin = currentUser.role === "REGION_ADMIN";
    const report = await generateDailyCallPlanReport({
      ...body,
      generatedBy: currentUser.id,
      regionId,
      allowCreate: !isRegionAdmin,
    });

    if (isRegionAdmin && currentUser.regionId) {
      const region = await findRegionById(currentUser.regionId);
      if (region) {
        response.status(201).json({
          data: filterReportForRegion(report, region),
        });
        return;
      }
    }

    response.status(201).json({
      data: report,
    });
  });
