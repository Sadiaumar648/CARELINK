# CareLink — Progress

Last updated: 2026-08-27

## Status: Backend complete. Frontend foundation and first screens live.

## What CareLink is

A Ghana-based platform where parents book vetted caregiving staff to look after their children/wards. Monorepo with two Next.js apps: `carelink-backend` (API routes only, done) and `carelink-frontend` (UI, in progress).

## Backend — done

Built on Next.js API routes + Supabase (Postgres, Auth, Storage), with row-level security as the primary authorization mechanism — the database enforces the rules, not just the application code.

**Features shipped:**

- Accounts and roles (parent, staff, admin), invitation-based staff onboarding
- Parent household and ward (child) profiles
- Staff profiles, skills, service areas, availability windows
- Caregiver search and matching (weighted scoring: availability, area, skills, rating/experience, budget)
- Natural-language search — a parent can type a plain-language request and it's parsed into structured filters via Claude
- Booking lifecycle: request → accept/decline → pay → start → end → review, with a database-enforced state machine and double-booking prevention
- Identity verification: ID + selfie upload, admin review queue, AI-assisted photo plausibility check via Claude (advisory only — a human always makes the final call)
- Symmetric emergency-contact reveal, visible to both sides only while a booking is active
- Payments (fake/sandbox provider), commission split, session tracking
- In-booking messaging, post-booking reviews with rating aggregation, abuse reports
- Notifications
- Admin dashboards: overview, roster, bookings, verification queue, settings (including live-tunable match-scoring weights)
- Security review pass: tightened storage access rules, added CORS protection, documented the one known gap (no rate limiting yet)
- Data retention: verification photos are automatically deleted 30 days after a decision is made; the decision record itself is kept for audit

**Quality bar every feature was held to:**

- Real database migrations, pushed to the live Supabase project (no local/mock database)
- Real integration tests against that live project — 119 tests, all passing
- Lint and type-checking clean
- Every change committed and pushed to GitHub, with CI (GitHub Actions) green
- Deployed live on Vercel, auto-deploying on every push to `main`

## Frontend — foundation done, most screens still to build

`carelink-frontend` signs in directly with Supabase Auth, then forwards the session token to the backend as `Authorization: Bearer <token>` on every request — the one place it talks to Supabase directly.

**What's built:**

- Design system matching the Design Brief: paper-and-ink palette, one serif typeface throughout, square corners, a five-step spacing scale, no component library (a small hand-rolled set instead: Button, Field, Sheet, StatusBadge)
- Auth: sign-in (with return-to-intended-page), parent self-registration (handles the "check your email" step), staff invitation claim
- Per-role navigation shells for parent, staff, and admin, each gated so a signed-out visitor is sent to sign in and a signed-in wrong-role visitor is sent to their own home instead of an error
- Three real, working screens, each exercising the full stack end to end against the live backend: parent caregiver search (including the plain-language search parsed by Claude) with a caregiver profile page, staff's booking requests inbox (accept/decline), and admin's overview dashboard
- Every other nav destination is a real page with a "being built next" placeholder, so nothing is a dead link while the rest gets filled in
- Deployed live on Vercel, auto-deploying on every push to `main`, CI green

**Still to build:** the booking request flow (request a time, pay, message), parent's ward (child) profiles, booking lists/detail for all three roles, identity verification screens (photo capture, admin review queue), messaging, reviews, admin roster/settings/reports, and an accessibility pass on the caregiver-facing screens.

## A couple of open items (not blockers)

- No application-level rate limiting yet on the backend (needs an external service like Upstash to do properly on Vercel — flagged, not built, low urgency pre-launch)
- AI accuracy measurement, a performance pass, and real user testing all need more of the frontend built first, so they're on hold
