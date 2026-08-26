# Security review — self-checklist (Sprint 5)

A pass over the backend built through Sprint 4, checked against the PRD's non-functional requirements (§7: security, privacy, auditability) and the "database enforces the rules" principle from the Technical Design doc. Two real gaps were found and fixed; the rest confirm existing design decisions.

## Checked

- **Every route authorizes server-side.** All protected routes go through `requireUser`/`requireRole` (`lib/auth/require-user.ts`), which validates the bearer token against Supabase's auth server (`supabase.auth.getUser`, not a local JWT decode) and reads the caller's role from `public.users`, never from the request. Confirmed no route trusts a role or user id passed in a body or query string.
- **RLS is on for every table**, and policies were re-derived from first principles per table while reading through the migrations — no table relies on the application remembering to filter.
- **Secrets never committed.** `.env*` is gitignored at both the root and `carelink-backend/`; confirmed via `git ls-files` that no env file is tracked. Production/CI secrets live in Vercel env vars and GitHub Actions secrets, not in the repo.
- **Identity documents are private and access-controlled.** The `identity-documents` storage bucket is non-public; the admin review route (`app/api/admin/verifications/[id]/route.ts`) serves photos only as 300-second signed URLs, never a public link, matching the PRD's privacy NFR.
- **The emergency-contact reveal is gated correctly** — checked `app/api/bookings/[id]/route.ts` again: it only surfaces `emergency_contact_name`/`emergency_contact_phone` when `booking.status === "active"`, symmetric for both parties.
- **AI-provider writes go through the service role deliberately**, not because RLS was widened — `verification_submissions` still only grants UPDATE to admins; the photo-check verdict is written by the service-role client because it's a system-generated field, and this is the only route doing so.

## Found and fixed

1. **Storage RLS let a submitter alter or delete their own evidence.** `identity_documents_owner_rw` was `for all` (select/insert/update/delete) — a user could overwrite or delete their submitted ID/selfie after an admin had already opened the review queue. Split into `identity_documents_owner_insert` and `identity_documents_owner_read`; neither update nor delete is available to the owner anymore. Migration `20260827220000`.
2. **No CORS restriction existed at all.** `ALLOWED_ORIGIN` was defined in `.env.local` but never referenced anywhere in the code, so every route ran with the platform default (no `Access-Control-Allow-Origin`). Added `middleware.ts`, which sets CORS headers only for origins in the comma-separated `ALLOWED_ORIGIN` list. This is defense-in-depth, not the primary control — auth here is a bearer token read from JS, not a cookie, so a disallowed origin can't ride along automatically the way it could with cookie auth.

## Known, accepted gap

- **No application-level rate limiting.** There's no per-IP or per-user request throttling on any route (Supabase's own auth rate limits still apply to sign-in/sign-up). In-memory limiting isn't reliable across Vercel's serverless instances; a real fix needs an external store (e.g. Upstash Redis) and wasn't built given the project's time constraints. Flagging this here rather than leaving it silent.

## Retention

The PRD's open question — how long verification photographs are retained after a decision — is resolved by the new retention routine documented in the Engineering Plan write-up (task 5.x): `images_purge_after` (already defined in doc 5's schema, previously unpopulated) is now set to 30 days past a decision by the `sync_verification_status_on_decision` trigger, and a daily Vercel Cron job (`app/api/internal/retention/route.ts`, `vercel.json`) deletes the storage files and nulls their paths once that deadline passes. The submission row, its decision, and its verdict are kept indefinitely for audit, per PRD F3.
