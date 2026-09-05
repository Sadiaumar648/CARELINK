-- CareLink's real phone/SMS notification system (backend + integration
-- task). A delivery log for every SMS the app attempts to send, and —
-- more importantly — the mechanism that makes sending idempotent: the
-- unique index below on (booking_id, event_type) means a second attempt
-- at the exact same notification for the exact same booking (a retried
-- request, a frontend poll landing twice, dispatch advancing again)
-- collides with an existing row and is skipped by the application code
-- in lib/services/notify.ts, which always inserts a row here BEFORE
-- calling the SMS provider. Written exclusively by that service-role-
-- only application code, never by a client or a trigger — same
-- "narrow, justified service-role write" precedent already used for the
-- one cross-party step in app/api/bookings/[id]/accept/route.ts.

create table public.sms_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  booking_id uuid references public.bookings (id),
  event_type text not null,
  phone text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- The idempotency guarantee itself: at most one row per (booking, event
-- type) — e.g. only ever one 'offer_created' row for a given offer,
-- regardless of how many times the route/poll that triggers it runs.
create unique index sms_notifications_booking_event_unique
  on public.sms_notifications (booking_id, event_type)
  where booking_id is not null;

create index sms_notifications_user_idx on public.sms_notifications (user_id, created_at);

alter table public.sms_notifications enable row level security;

-- Admin-only read (delivery observability) — never exposed to the
-- notification's own recipient or the other party to the booking; this
-- table exists for operational visibility, not as a user-facing feature.
-- No insert/update/delete policy for `authenticated` at all: every write
-- comes from lib/services/notify.ts's service-role client, which
-- bypasses RLS entirely, same as every other service-role-only table
-- already in this schema.
create policy "sms_notifications_admin_read" on public.sms_notifications
  for select
  using (public.current_user_role() = 'admin');
