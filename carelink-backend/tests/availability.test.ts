import {
  checkAvailability,
  splitRangeByDay,
  type AvailabilityWindow,
} from "../lib/services/availability";

// Pure-function unit tests for task 2.5 — no database, no dev server.
// 2027-01-04 is a Monday (UTC), used throughout as a known reference date.

describe("splitRangeByDay", () => {
  it("returns one segment for a same-day range", () => {
    const segments = splitRangeByDay(
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T18:00:00Z"),
    );
    expect(segments).toEqual([
      { date: "2027-01-04", weekday: 1, startTime: "14:00", endTime: "18:00" },
    ]);
  });

  it("splits an overnight range crossing midnight into two day segments", () => {
    const segments = splitRangeByDay(
      new Date("2027-01-04T22:00:00Z"),
      new Date("2027-01-05T06:00:00Z"),
    );
    expect(segments).toEqual([
      { date: "2027-01-04", weekday: 1, startTime: "22:00", endTime: "24:00" },
      { date: "2027-01-05", weekday: 2, startTime: "00:00", endTime: "06:00" },
    ]);
  });
});

describe("checkAvailability", () => {
  it("is available inside a single declared window", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "14:00", endTime: "18:00" }];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T16:00:00Z"),
    );
    expect(result).toEqual({ available: true });
  });

  it("is unavailable outside declared hours", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "14:00", endTime: "18:00" }];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T09:00:00Z"),
      new Date("2027-01-04T11:00:00Z"),
    );
    expect(result).toEqual({ available: false, reason: "outside_declared_hours" });
  });

  it("merges two contiguous windows to cover a request spanning both", () => {
    const windows: AvailabilityWindow[] = [
      { weekday: 1, startTime: "14:00", endTime: "16:00" },
      { weekday: 1, startTime: "16:00", endTime: "18:00" },
    ];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T18:00:00Z"),
    );
    expect(result.available).toBe(true);
  });

  it("does not bridge a gap between two non-contiguous windows", () => {
    const windows: AvailabilityWindow[] = [
      { weekday: 1, startTime: "14:00", endTime: "16:00" },
      { weekday: 1, startTime: "17:00", endTime: "18:00" },
    ];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T18:00:00Z"),
    );
    expect(result).toEqual({ available: false, reason: "outside_declared_hours" });
  });

  it("an exception marking the date unavailable overrides a declared window", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "14:00", endTime: "18:00" }];
    const result = checkAvailability(
      windows,
      [{ onDate: "2027-01-04", unavailable: true }],
      [],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T16:00:00Z"),
    );
    expect(result).toEqual({ available: false, reason: "marked_unavailable" });
  });

  it("an overnight booking is available when both days' windows are declared", () => {
    // Monday overnight window (22:00-23:59 next-day boundary) plus
    // Tuesday's early-morning window — doc 5's CHECK(end_time > start_time)
    // means an overnight shift is always two rows, never one wrapping row.
    const windows: AvailabilityWindow[] = [
      { weekday: 1, startTime: "22:00", endTime: "24:00" },
      { weekday: 2, startTime: "00:00", endTime: "06:00" },
    ];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T22:00:00Z"),
      new Date("2027-01-05T06:00:00Z"),
    );
    expect(result).toEqual({ available: true });
  });

  it("an overnight booking is refused if the second day's window is missing", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "22:00", endTime: "24:00" }];
    const result = checkAvailability(
      windows,
      [],
      [],
      new Date("2027-01-04T22:00:00Z"),
      new Date("2027-01-05T06:00:00Z"),
    );
    expect(result).toEqual({ available: false, reason: "outside_declared_hours" });
  });

  it("is unavailable when it overlaps an existing busy range", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "14:00", endTime: "18:00" }];
    const result = checkAvailability(
      windows,
      [],
      [{ startsAt: new Date("2027-01-04T15:00:00Z"), endsAt: new Date("2027-01-04T17:00:00Z") }],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T16:00:00Z"),
    );
    expect(result).toEqual({ available: false, reason: "conflicts_with_existing_booking" });
  });

  it("is available when adjacent to, but not overlapping, a busy range", () => {
    const windows: AvailabilityWindow[] = [{ weekday: 1, startTime: "14:00", endTime: "18:00" }];
    const result = checkAvailability(
      windows,
      [],
      [{ startsAt: new Date("2027-01-04T16:00:00Z"), endsAt: new Date("2027-01-04T18:00:00Z") }],
      new Date("2027-01-04T14:00:00Z"),
      new Date("2027-01-04T16:00:00Z"),
    );
    expect(result).toEqual({ available: true });
  });
});
