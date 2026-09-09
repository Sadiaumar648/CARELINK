-- Completes the "Generate Caregiver Onboarding Link" feature. The link
-- itself, its admin management, and registration_count all already
-- existed (20260914000000_caregiver_onboarding_links.sql); that
-- migration's own comment explicitly deferred the actual
-- self-registration path ("a separate, larger, not-yet-approved piece
-- of work"). This is that piece, approved.
--
-- claim_onboarding_link_registration atomically re-validates the link
-- (active, not expired, under its registration cap) and increments
-- registration_count in the same statement. Two caregivers opening a
-- nearly-full link at the same moment can never both succeed past the
-- cap this way — a plain application-side read-then-update could let
-- that race through. Called with the service-role client from
-- POST /api/auth/join-onboarding-link (a public, unauthenticated route
-- by necessity — the caregiver has no account yet), the same way that
-- route already uses the service role for everything else.
create or replace function public.claim_onboarding_link_registration(link_token text)
returns table (link_id uuid, ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.caregiver_onboarding_links
  set registration_count = registration_count + 1
  where token = link_token
    and status = 'active'
    and (expires_at is null or expires_at > now())
    and registration_count < max_registrations
  returning id into v_id;

  return query select v_id, (v_id is not null);
end;
$$;

-- Best-effort compensating decrement for the rare case where a slot was
-- claimed above but the caregiver's auth account then failed to create
-- (e.g. a duplicate phone number) — called from the same route so a
-- failed registration attempt never permanently uses up a real slot.
-- Never decrements below zero.
create or replace function public.release_onboarding_link_registration(link_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.caregiver_onboarding_links
  set registration_count = greatest(registration_count - 1, 0)
  where token = link_token;
$$;
