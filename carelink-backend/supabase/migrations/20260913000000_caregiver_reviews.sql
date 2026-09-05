-- Two-way CareLink reviews, the caregiver -> parent direction.
-- public.reviews (parent -> caregiver) is completely untouched by this
-- migration: no column, constraint, policy, function, or trigger on it
-- changes. This adds a structurally separate table for the other
-- direction, mirroring reviews' own shape and RLS pattern.
--
-- public.bookings is NOT altered by this migration — no new column, no
-- new constraint, no data change. An earlier draft of this migration
-- proposed two composite unique constraints on bookings to support a
-- composite foreign key guaranteeing "this review's staff_profile_id/
-- parent_profile_id match the booking's real parties." On review, that
-- guarantee is fully achieved instead by the INSERT policy below, which
-- independently checks both columns against the real booking row at
-- insert time — the same enforcement, with no schema change to bookings.

create table public.caregiver_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  staff_profile_id uuid not null references public.staff_profiles (id),
  parent_profile_id uuid not null references public.parent_profiles (id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  hidden_by_admin boolean not null default false,
  hidden_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.caregiver_reviews
  for each row execute function public.set_updated_at();

alter table public.caregiver_reviews enable row level security;

create policy "caregiver_reviews_read_parties" on public.caregiver_reviews
  for select
  using (
    public.is_parent_profile_owner(parent_profile_id)
    or public.is_staff_profile_owner(staff_profile_id)
    or public.current_user_role() = 'admin'
  );

-- Independently verifies BOTH staff_profile_id and parent_profile_id
-- against the real booking row (not just booking_id + staff_profile_id)
-- — this is what guarantees a review can't be attached to the wrong
-- parent, with no composite FK back to bookings needed for it.
create policy "caregiver_reviews_insert_staff_on_completed" on public.caregiver_reviews
  for insert
  with check (
    public.is_staff_profile_owner(staff_profile_id)
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status = 'completed'
        and b.staff_profile_id = caregiver_reviews.staff_profile_id
        and b.parent_profile_id = caregiver_reviews.parent_profile_id
    )
  );

-- Admin-only update (hide/unhide) — mirrors reviews_update_staff_or_admin's
-- admin half exactly. No staff or parent update policy exists: nobody
-- can edit a submitted review, only admin can hide it — same as reviews.
create policy "caregiver_reviews_update_admin" on public.caregiver_reviews
  for update
  using (public.current_user_role() = 'admin');

-- ── parent rating aggregation ───────────────────────────────────────────
-- Additive, nullable/defaulted — every existing parent_profiles row and
-- every existing reader of that table is unaffected by adding these.

alter table public.parent_profiles add column rating_avg numeric(3, 2);
alter table public.parent_profiles add column rating_count integer not null default 0;

-- Deliberately a new, separate function — not a rewrite of
-- recalculate_staff_rating() — so the two aggregations can never cross-
-- contaminate. staff_profiles.rating_avg/rating_count, the reviews
-- table, and recalculate_staff_rating() are all untouched by this
-- migration.
create or replace function public.recalculate_parent_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_parent_profile_id uuid;
begin
  target_parent_profile_id := coalesce(new.parent_profile_id, old.parent_profile_id);

  update public.parent_profiles pp
  set
    rating_avg = (
      select avg(cr.rating)::numeric(3, 2)
      from public.caregiver_reviews cr
      where cr.parent_profile_id = target_parent_profile_id
        and cr.hidden_by_admin = false and cr.deleted_at is null
    ),
    rating_count = (
      select count(*)
      from public.caregiver_reviews cr
      where cr.parent_profile_id = target_parent_profile_id
        and cr.hidden_by_admin = false and cr.deleted_at is null
    )
  where pp.id = target_parent_profile_id;

  return coalesce(new, old);
end;
$$;

create trigger recalculate_parent_rating_ins
  after insert on public.caregiver_reviews
  for each row execute function public.recalculate_parent_rating();

create trigger recalculate_parent_rating_upd
  after update on public.caregiver_reviews
  for each row execute function public.recalculate_parent_rating();
