-- CareLink's finalized fixed-rate pricing model. Purely additive: every
-- new column is nullable or has a safe, non-pricing default, so every
-- existing care_requests row is untouched — no historical row is
-- backfilled or recalculated. See packages/shared/src/pricing.ts and
-- packages/shared/src/schedule.ts for the shared constants/formulas
-- these columns hold the output of, and app/api/care-requests/route.ts
-- for where they're computed server-side, never trusted from the client.
--
-- repeat_mode/repeat_weekdays/repeat_start_date/repeat_end_date: the
-- structured recurrence pattern behind the Weekly/Custom schedule
-- options (previously just folded into free-text notes) — needed so the
-- backend can independently count real calendar occurrences instead of
-- trusting a client-sent count. `date`/`start_time`/`end_time` (existing
-- columns) keep meaning exactly what they always have: the one real
-- occurrence this care_requests row (and the one real booking dispatch
-- ever creates from it) actually has.
--
-- session_count: how many real occurrences the chosen pattern covers —
-- always 1 for repeat_mode = 'once', a real counted number otherwise.
--
-- total_amount: the WHOLE recurring series' informational total
-- (fixed hourly rate x duration hours x session_count), shown to the
-- parent as a record of what they were quoted — never charged directly.
-- A bookings row's own total_amount (unchanged by this migration) is
-- always exactly one session's cost; conflating the two would overcharge
-- a parent for a single session at the full series price.

alter table public.care_requests
  add column repeat_mode text not null default 'once'
    check (repeat_mode in ('once', 'weekly', 'custom')),
  add column repeat_weekdays text[] not null default '{}',
  add column repeat_start_date date,
  add column repeat_end_date date
    check (repeat_end_date is null or repeat_start_date is null or repeat_end_date >= repeat_start_date),
  add column session_count integer not null default 1 check (session_count > 0),
  add column total_amount integer check (total_amount is null or total_amount > 0);
