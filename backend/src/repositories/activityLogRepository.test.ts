import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRtplStatusChanges } from "./activityLogRepository.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  query: mocks.query,
}));

describe("activityLogRepository", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("scopes RTPL status changes to the selected IST business date", async () => {
    await listRtplStatusChanges({
      reportId: "report-1",
      changeDate: "2026-06-03",
      limit: 50,
    });

    const [sql, params] = mocks.query.mock.calls[0] ?? [];

    expect(sql).toContain("a.metadata->>'reportId' = $1");
    expect(sql).toContain("a.occurred_at >= $2::timestamptz");
    expect(sql).toContain("a.occurred_at < $3::timestamptz");
    expect(params).toEqual([
      "report-1",
      "2026-06-02T18:30:00.000Z",
      "2026-06-03T18:30:00.000Z",
      50,
    ]);
  });
});
