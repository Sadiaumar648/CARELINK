-- Task 2.7. Weights as data (doc 5 §4.13), not hard-coded, so the agency
-- can retune them (task 4.12) and an evaluation can compare rankings
-- under different weightings. Defaults match doc 2 (Technical Design) §5.

create table public.match_weights (
  factor text primary key,
  weight numeric(4, 3) not null check (weight >= 0 and weight <= 1),
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.match_weights
  for each row execute function public.set_updated_at();

insert into public.match_weights (factor, weight) values
  ('availability', 0.30),
  ('area', 0.25),
  ('skills', 0.20),
  ('rating_experience', 0.15),
  ('budget', 0.10);

alter table public.match_weights enable row level security;

create policy "match_weights_read_authenticated" on public.match_weights
  for select
  using (auth.role() = 'authenticated');

create policy "match_weights_admin_write" on public.match_weights
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
