// The one place the caregiver dispatch response window is defined — not
// a magic number scattered across routes/services. A care_request's own
// response_window_seconds column defaults to this at creation and can be
// overridden per request if a future feature ever needs to (e.g. a
// shorter window for an urgent same-day request); nothing today changes
// it, but the column exists so it's genuinely configurable rather than
// hardcoded.
export const DEFAULT_DISPATCH_RESPONSE_WINDOW_SECONDS = 120;

// CareLink location system, Part 6: how recent a caregiver's live
// dispatch location fix (staff_dispatch_locations.updated_at) has to be
// to count as "closest now" rather than stale. A caregiver who's gone
// Available but whose device hasn't checked in within this window is
// treated as not having a usable current position for this dispatch
// cycle — never silently used as if it were current.
export const MAX_DISPATCH_LOCATION_AGE_SECONDS = 10 * 60;
