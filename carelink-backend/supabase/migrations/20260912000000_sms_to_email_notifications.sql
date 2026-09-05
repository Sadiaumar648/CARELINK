-- CareLink notifications: switch delivery channel from SMS (Africa's
-- Talking) to email (Resend). Renames the existing sms_notifications
-- table in place — same delivery-log shape, same idempotency guarantee
-- (the unique index on (booking_id, event_type)), same admin-only read
-- policy — just email instead of phone/SMS. The table was confirmed
-- empty in production immediately before this migration, so this is a
-- clean rename, not a data migration; nothing is lost or reinterpreted.

alter table public.sms_notifications rename to email_notifications;
alter table public.email_notifications rename column phone to email;

-- Email needs a subject line, which SMS never did.
alter table public.email_notifications
  add column subject text not null default '';
alter table public.email_notifications
  alter column subject drop default;

alter index sms_notifications_booking_event_unique
  rename to email_notifications_booking_event_unique;
alter index sms_notifications_user_idx
  rename to email_notifications_user_idx;

alter policy "sms_notifications_admin_read" on public.email_notifications
  rename to "email_notifications_admin_read";
