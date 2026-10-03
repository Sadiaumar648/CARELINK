-- The payment-deadline/auto-cancellation feature this cron enforced
-- (20260910100000_payment_window_pg_cron_sweep.sql) was removed from
-- the app entirely at the user's explicit request — there is no longer
-- any countdown, warning, or deadline concept anywhere in the frontend,
-- and lib/services/payment-window.ts (the "attended" expiry path this
-- cron was only ever a safety net for) has been deleted. But
-- terms_locked_at is still set on every acceptance/auto-assignment, so
-- this cron's WHERE clause kept matching real bookings and silently
-- cancelling them 10 minutes after assignment with no in-app warning
-- that this would happen — exactly the opposite of the removed
-- feature's intent. Unschedule the job and drop the now-unused
-- function; nothing else depends on either.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-expired-payment-windows') then
    perform cron.unschedule('sweep-expired-payment-windows');
  end if;
end $$;

drop function if exists public.sweep_expired_payment_windows();
