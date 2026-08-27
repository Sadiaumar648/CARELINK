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
- Reporting/disputing a user from inside a booking, both directions — required a small backend addition first (the booking-detail route now also returns the other party's user id, resolved the same way the emergency-contact reveal already was)
- A guided selfie capture for identity verification: live camera preview with an on-screen guide, capture/retake, and a graceful fallback to a plain file upload if the camera can't be reached
- An accessibility pass on the caregiver-facing (staff) screens: every nav item, the sign-out control, the accept/decline/start/end actions, the skill tags, and the availability grid all meet a 52px minimum touch target; an opt-in toggle reads each screen's heading aloud via the browser's speech synthesis; keyboard navigation needed no changes since every control was already a native, focusable element
- Deployed live on Vercel, auto-deploying on every push to `main`, CI green

**Verification method:** no browser tool is available in this environment, so every feature was verified by scripting the exact request/response sequence the UI code makes against the live backend and database (sign-up through booking through payment through completion through review through filing a report; verification submission through admin approval; staff profile setup through actually appearing in a real search) — strong evidence the wiring is correct end to end, but not a substitute for clicking through it yourself. Two features are real browser APIs (camera, speech synthesis) this environment has no browser to exercise at all — worth trying the verification form's "Use camera" flow and the staff account's read-aloud toggle by hand.

## A couple of open items (not blockers)

- No application-level rate limiting yet on the backend (needs an external service like Upstash to do properly on Vercel — flagged, not built, low urgency pre-launch)
- AI accuracy measurement, a performance pass, and real user testing are all still worth doing now that there's a working frontend to test against
- **Test-account cleanup is incomplete.** The live Supabase project accumulated ~380 test accounts from this session's verification scripts. A cleanup pass deleted 32 of them (the ones with no bookings/messages/etc. attached) but the rest fail with a database error — they have dependent rows (bookings, payments, messages, reviews, reports) that foreign keys block a plain user deletion from cascading through. Finishing this properly means deleting each user's dependent rows in the right order first (or adding `ON DELETE CASCADE` where it's missing), which is real, careful work against production data that wasn't worth rushing. The real account (`umarhalimatu5@gmail.com`) and the legitimate seed/invite data were correctly left untouched either way.
