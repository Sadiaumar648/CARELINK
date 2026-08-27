# CareLink — Progress

Last updated: 2026-08-27

## Status: Backend complete. Frontend covers the full core product for all three roles.

## What CareLink is

A Ghana-based platform where parents book vetted caregiving staff to look after their children/wards. Monorepo with two Next.js apps: `carelink-backend` (API routes only, done) and `carelink-frontend` (UI, functionally complete for the core flows — polish items remain).

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

## Frontend — the core product works end to end for all three roles

`carelink-frontend` signs in directly with Supabase Auth, then forwards the session token to the backend as `Authorization: Bearer <token>` on every request — the one place it talks to Supabase directly.

**What's built:**

- Design system matching the Design Brief: paper-and-ink palette, one serif typeface throughout, square corners, a five-step spacing scale, no component library (a small hand-rolled set instead: Button, Field, Sheet, StatusBadge)
- Auth: sign-in (with return-to-intended-page), parent self-registration (handles the "check your email" step), staff invitation claim
- Per-role navigation shells for parent, staff, and admin, each gated so a signed-out visitor is sent to sign in and a signed-in wrong-role visitor is sent to their own home instead of an error, plus a notifications bell with unread count and click-through
- **Parent**: caregiver search (including the plain-language search parsed by Claude) with a caregiver profile page, household + ward (child) setup, the full booking request flow, a bookings list and detail page with every status-driven action (pay, cancel, review), in-booking messaging, identity verification submission, account page
- **Staff**: profile setup (bio/rate, skills, service areas, a tapped weekly availability grid — without this a caregiver could never actually appear in search), the requests inbox (accept/decline), a schedule of upcoming bookings with the same detail/actions as the parent side (start/end a session), earnings, messaging, identity verification submission
- **Admin**: overview dashboard, roster with an "invite a caregiver" flow that issues the claim code, a full bookings history, the verification review queue (side-by-side ID/selfie via signed URLs, the AI plausibility check shown as advisory only), reports triage (open → investigating → resolved), and settings (match-scoring weights, commission rate)
- Deployed live on Vercel, auto-deploying on every push to `main`, CI green

**Verification method:** no browser tool is available in this environment, so every feature was verified by scripting the exact request/response sequence the UI code makes against the live backend and database (sign-up through booking through payment through completion through review; verification submission through admin approval; staff profile setup through actually appearing in a real search) — not a substitute for clicking through it yourself, but strong evidence the wiring is correct end to end.

**Still to build:** reporting/disputing a user from inside a booking (the backend route exists but only exposes the caregiver's user id to a parent, not the parent's id to staff, so this needs a small backend addition first), a proper guided camera-capture UI for the verification selfie (currently a plain file input with a camera-preferring capture attribute — functional but not the polished version the App Flow doc describes), and an accessibility pass on the caregiver-facing screens (larger touch targets, keyboard-only navigation, read-aloud on arrival).

## A couple of open items (not blockers)

- No application-level rate limiting yet on the backend (needs an external service like Upstash to do properly on Vercel — flagged, not built, low urgency pre-launch)
- AI accuracy measurement, a performance pass, and real user testing are all still worth doing now that there's a working frontend to test against
- The live Supabase project has accumulated a lot of test accounts from this session's verification scripts — worth a cleanup pass before real users show up
