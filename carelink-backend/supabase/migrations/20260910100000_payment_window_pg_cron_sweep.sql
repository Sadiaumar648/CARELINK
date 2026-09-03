-- CareLink's finalized payment workflow, Part 4 (tightened): a
-- background reconciliation for an abandoned "awaiting payment"
-- booking — the parent closed the tab entirely and never came back —
-- that runs far more often than the existing daily Vercel Cron jobs
-- (/api/internal/retention, /api/internal/dispatch-sweep) can. Vercel
-- Cron is capped at once-a-day triggers on this project's plan; that
-- limit is a Vercel-account fact, not a code fact, so rather than build
-- something that silently depends on upgrading a hosting plan, this
-- reconciliation runs entirely inside Postgres itself via pg_cron — a
-- Supabase-provisioned extension, available regardless of the app's own
-- hosting tier, with no dependency on the Next.js deployment being
-- reachable at all.
--
-- This does NOT replace the live, attended expiry path — that remains
-- exactly as it was: lib/services/payment-window.ts's
-- expirePaymentWindowIfPassed(), called from GET /api/bookings/[id],
-- the dispatch-status poll, and POST /api/bookings/[id]/payments, is
-- still what expires a booking within seconds for anyone actually
-- looking at the page. This is only the safety net for when nobody is.

create extension if not exists pg_cron;

-- The same reconciliation rule as expirePaymentWindowIfPassed, in SQL:
-- an 'accepted' booking whose payment window has closed, with no
-- payment attempt in flight or already succeeded, is released the same
-- way that function releases one — cancelled_by left null (the
-- existing "the clock did it, not a person" signal
-- notify_on_booking_status_change already keys off of, added in
-- 20260910000000), cancel_reason set to the identical message. This is
-- a normal UPDATE, so that notification trigger — and every other
-- existing trigger on bookings — fires exactly as it would for any
-- other cancellation; nothing about the notification or booking-events
-- architecture is bypassed or duplicated here.
--
-- The 10-minute window is the same figure as PAYMENT_WINDOW_SECONDS in
-- carelink-backend/lib/dispatch-config.ts — if that constant ever
-- changes, this interval must be updated to match (there is no shared
-- source of truth across the TypeScript/Postgres boundary; this is the
-- one place on the database side it needs to stay in sync).
create or replace function public.sweep_expired_payment_windows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings b
  set status = 'cancelled',
      cancel_reason = 'Payment window expired — this booking was automatically released.'
  where b.status = 'accepted'
    and b.terms_locked_at is not null
    and b.terms_locked_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.payments p
      where p.booking_id = b.id
        and p.status in ('initiated', 'pending', 'succeeded')
    );
end;
$$;

-- Runs every minute — released "promptly" for an abandoned session
-- means at most ~1 minute of extra reservation past the real 10-minute
-- deadline, not up to a day. Safe to re-run this migration: an existing
-- job of the same name is unscheduled first rather than erroring or
-- creating a duplicate.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-expired-payment-windows') then
    perform cron.unschedule('sweep-expired-payment-windows');
  end if;
end $$;

select cron.schedule(
  'sweep-expired-payment-windows',
  '* * * * *',
  $$select public.sweep_expired_payment_windows();$$
);
