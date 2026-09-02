// The one place the caregiver dispatch response window is defined — not
// a magic number scattered across routes/services. A care_request's own
// response_window_seconds column defaults to this at creation and can be
// overridden per request if a future feature ever needs to (e.g. a
// shorter window for an urgent same-day request); nothing today changes
// it, but the column exists so it's genuinely configurable rather than
// hardcoded.
export const DEFAULT_DISPATCH_RESPONSE_WINDOW_SECONDS = 120;

// How many vicinity rounds dispatch will try before giving up. Round 0 is
// the requested area (exact match); round 1 drops the area filter
// entirely. There is no real geographic/adjacency data anywhere in this
// schema (staff_areas.area is a free-text string, not coordinates), so a
// true multi-ring "nearest neighbourhood" expansion isn't something this
// app can honestly compute — two rounds is the ceiling of what
// "progressive expansion" can mean without inventing geography that
// doesn't exist.
export const MAX_VICINITY_ROUND = 1;
