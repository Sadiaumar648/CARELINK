# CareLink

Booking and staff-management platform for an existing babysitting and nanny agency in Ghana. Built as a BSc Information Technology final year project.

## Layout

- `carelink-backend/` — Next.js app, API routes only (`app/api/**`). Owns the database, the booking state machine, matching, verification and payment logic.
- `carelink-frontend/` — Next.js app rendering the parent, staff and administrator interfaces. Calls `carelink-backend` for everything except sign-in/sign-up, which goes to Supabase Auth directly.
- `packages/shared/` — Zod schemas and TypeScript types used by both apps.
- `carelink documentation/` — the six planning documents (Product Requirements, Technical Design, App Flow, Design Brief, Backend Schema, Engineering Plan) and the original project proposal. These are the source of truth for scope and design decisions.

## Setup

```
npm install
npm run dev:backend
```

Requires a `.env.local` in `carelink-backend/` with Supabase credentials — see that folder's own notes once the Supabase project exists.
