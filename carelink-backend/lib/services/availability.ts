// Task 2.5. Pure functions — no I/O — so they can be unit-tested directly
// against fixture data, per the Engineering Plan's acceptance criteria for
// this task. Callers (search, task 2.6; booking request, task 2.11) fetch
// the caregiver's windows, exceptions and busy times once, then call
// isBookingWithinAvailability with the requested range.

export type AvailabilityWindow = {
  weekday: number; // 0 = Sunday .. 6 = Saturday, matching JS Date#getUTCDay()
  startTime: string; // "HH:MM", 24-hour
  endTime: string; // "HH:MM", strictly after startTime — an overnight
  // shift is declared as two rows, one ending at 23:59 and the next
  // starting at 00:00 on the following weekday (doc 5, §4.6's own
  // CHECK (end_time > start_time) rules out a single wrapping row).
};

export type AvailabilityException = {
  onDate: string; // "YYYY-MM-DD"
  unavailable: boolean;
};

export type BusyRange = {
  startsAt: Date;
  endsAt: Date;
};

type DaySegment = {
  date: string; // "YYYY-MM-DD", UTC
  weekday: number;
  startTime: string;
  endTime: string;
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function toTimeString(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Splits a [startsAt, endsAt) range into one segment per UTC calendar day
 * it touches, each carrying that day's weekday and the HH:MM portion of
 * the range falling on it. This is what makes an overnight booking
 * (e.g. Mon 22:00 -> Tue 06:00) checkable against two separate days'
 * declared windows.
 */
export function splitRangeByDay(startsAt: Date, endsAt: Date): DaySegment[] {
  if (endsAt <= startsAt) return [];

  const segments: DaySegment[] = [];
  let cursor = startsAt;

  while (cursor < endsAt) {
    const dayEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, 0, 0, 0),
    );
    const segmentEnd = dayEnd < endsAt ? dayEnd : endsAt;

    segments.push({
      date: toDateString(cursor),
      weekday: cursor.getUTCDay(),
      startTime: toTimeString(cursor),
      endTime: segmentEnd.getTime() === dayEnd.getTime() ? "24:00" : toTimeString(segmentEnd),
    });

    cursor = segmentEnd;
  }

  return segments;
}

function timeToMinutes(t: string): number {
  if (t === "24:00") return 24 * 60;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** True if [startTime, endTime) is fully covered by the union of that weekday's windows. */
function isTimeRangeCovered(
  windows: AvailabilityWindow[],
  weekday: number,
  startTime: string,
  endTime: string,
): boolean {
  const dayWindows = windows
    .filter((w) => w.weekday === weekday)
    .map((w) => ({ start: timeToMinutes(w.startTime), end: timeToMinutes(w.endTime) }))
    .sort((a, b) => a.start - b.start);

  let cursor = timeToMinutes(startTime);
  const target = timeToMinutes(endTime);

  for (const w of dayWindows) {
    if (w.start > cursor) break; // gap before this window — coverage already broke
    if (w.end > cursor) cursor = w.end;
    if (cursor >= target) return true;
  }

  return cursor >= target;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type AvailabilityCheckResult = {
  available: boolean;
  reason?: "outside_declared_hours" | "marked_unavailable" | "conflicts_with_existing_booking";
};

/**
 * The hard filter's and the booking request's shared question: can this
 * caregiver take a booking for exactly this range, given what they've
 * declared and what they already hold.
 */
export function checkAvailability(
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[],
  busyRanges: BusyRange[],
  startsAt: Date,
  endsAt: Date,
): AvailabilityCheckResult {
  const exceptionByDate = new Map(exceptions.map((e) => [e.onDate, e]));

  for (const segment of splitRangeByDay(startsAt, endsAt)) {
    const exception = exceptionByDate.get(segment.date);
    if (exception?.unavailable) {
      return { available: false, reason: "marked_unavailable" };
    }
    if (!isTimeRangeCovered(windows, segment.weekday, segment.startTime, segment.endTime)) {
      return { available: false, reason: "outside_declared_hours" };
    }
  }

  for (const busy of busyRanges) {
    if (rangesOverlap(startsAt, endsAt, busy.startsAt, busy.endsAt)) {
      return { available: false, reason: "conflicts_with_existing_booking" };
    }
  }

  return { available: true };
}
