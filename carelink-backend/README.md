# carelink-backend

API-only Next.js app — every route lives under `app/api/**`. There is no user-facing UI here; see `carelink-frontend` for that.

## What's here

- `app/api/` — route handlers. `GET /api/health` is an unauthenticated liveness check; `GET /api/me` is the first protected route, used by the frontend right after sign-in.
- `lib/db/supabase-server.ts` — two client constructors: a request-scoped client (built from the caller's bearer token, subject to row-level security) and a service-role client (bypasses RLS, used sparingly and never to serve a request directly).
- `lib/auth/require-user.ts` — `requireUser` / `requireRole`, the guard every protected route starts with.
- `supabase/migrations/` — the schema, forward-only, one file per migration. Mirrors doc 5 (Backend Schema) in `../carelink documentation/`.

## Local setup

1. `cp .env.local.example .env.local` and fill in the Supabase project URL and keys (Project Settings → API in the Supabase dashboard).
2. From the repo root: `npm install`
3. Link the Supabase CLI to the project and push the schema:
   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. `npm run dev --workspace carelink-backend` (or `npm run dev:backend` from the repo root)
5. `curl http://localhost:3000/api/health` should return `{"status":"ok",...}`
