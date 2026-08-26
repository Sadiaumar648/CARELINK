-- Fixes a bug in migration 0001: handle_new_auth_user() copied role,
-- full_name, phone, account_status and invited_by from auth.users into
-- public.users, but never copied email — so a row created via the roster
-- flow (task 1.8) had no way to look up the auth identity it needed for
-- the server-side sign-in in the claim flow (task 1.9). Caught by the
-- roster-and-claim integration test.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, role, full_name, phone, email, account_status, invited_by)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'parent'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'account_status')::public.account_status, 'active'),
    nullif(new.raw_user_meta_data ->> 'invited_by', '')::uuid
  );
  return new;
end;
$$;
