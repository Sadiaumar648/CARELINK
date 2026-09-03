// The one place the caregiver dispatch response window is defined — not
// a magic number scattered across routes/services. A care_request's own
// response_window_seconds column defaults to this at creation and can be
// overridden per request if a future feature ever needs to (e.g. a
// shorter window for an urgent same-day request); nothing today changes
// it, but the column exists so it's genuinely configurable rather than
// hardcoded.
export const DEFAULT_DISPATCH_RESPONSE_WINDOW_SECONDS = 120;

// How many vicinity rounds dispatch will try before giving up.
//
// For a care request with resolved coordinates (CareLink location
// system, Part 7/8), this is now a genuine distance ring — round 0 is
// DISPATCH_VICINITY_RADII_KM[0], round 1 is [1], real kilometres, not a
// stand-in. For a request without coordinates (not yet migrated, or a
// caregiver with no location on file), it falls back to the original
// mechanism: round 0 is the requested area (exact string match), round
// 1 drops the area filter entirely — still capped at two rounds, since
// a free-text area name can't honestly support finer expansion than
// "this exact area" vs "anywhere".
export const MAX_VICINITY_ROUND = 1;

// Real kilometre radii for the two rounds above, indexed by round —
// only used once a care request has service_latitude/service_longitude
// (Phase 1). Values are a considered starting point for a compact,
// mostly-Accra service area, not a measured constant; tunable here if
// they prove too wide or too narrow in practice.
export const DISPATCH_VICINITY_RADII_KM = [5, 15];

// CareLink location system, Part 6: how recent a caregiver's live
// dispatch location fix (staff_dispatch_locations.updated_at) has to be
// to count as "closest now" rather than stale. A caregiver who's gone
// Available but whose device hasn't checked in within this window is
// treated as not having a usable current position for this dispatch
// cycle — never silently used as if it were current.
export const MAX_DISPATCH_LOCATION_AGE_SECONDS = 10 * 60;
