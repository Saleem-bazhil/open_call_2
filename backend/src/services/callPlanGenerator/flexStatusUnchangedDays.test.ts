import { describe, expect, it } from "vitest";
import { computeFlexStatusUnchangedDays } from "./flexStatusUnchangedDays.js";

describe("computeFlexStatusUnchangedDays", () => {
  it("returns null when there is no previous report at all", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Open",
        previousFlexStatus: undefined,
        previousCount: undefined,
        hadPreviousReport: false,
      }),
    ).toBeNull();
  });

  it("returns 1 when a previous report exists but the ticket is new", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Open",
        previousFlexStatus: undefined,
        previousCount: undefined,
        hadPreviousReport: true,
      }),
    ).toBe(1);
  });

  it("reads two consecutive same-status days as 2 when no prior count was stored", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Open",
        previousFlexStatus: "Open",
        previousCount: null,
        hadPreviousReport: true,
      }),
    ).toBe(2);
  });

  it("treats a previous count of 0 as a single prior day", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Open",
        previousFlexStatus: "Open",
        previousCount: 0,
        hadPreviousReport: true,
      }),
    ).toBe(2);
  });

  it("increments the persisted streak when the status is unchanged", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "In Progress",
        previousFlexStatus: "In Progress",
        previousCount: 3,
        hadPreviousReport: true,
      }),
    ).toBe(4);
  });

  it("resets to 1 when the status changed since the previous report", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Closed",
        previousFlexStatus: "Open",
        previousCount: 5,
        hadPreviousReport: true,
      }),
    ).toBe(1);
  });

  it("ignores case and surrounding whitespace when comparing statuses", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "  open ",
        previousFlexStatus: "OPEN",
        previousCount: 2,
        hadPreviousReport: true,
      }),
    ).toBe(3);
  });

  it("treats blank-to-value (and value-to-blank) as a status change", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "Open",
        previousFlexStatus: null,
        previousCount: 4,
        hadPreviousReport: true,
      }),
    ).toBe(1);

    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: "   ",
        previousFlexStatus: "Open",
        previousCount: 4,
        hadPreviousReport: true,
      }),
    ).toBe(1);
  });

  it("counts a matched ticket that stays blank on both days", () => {
    expect(
      computeFlexStatusUnchangedDays({
        currentFlexStatus: null,
        previousFlexStatus: null,
        previousCount: 2,
        hadPreviousReport: true,
      }),
    ).toBe(3);
  });
});
