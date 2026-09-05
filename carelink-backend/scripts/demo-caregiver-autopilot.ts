import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(__dirname, "../.env.local") });

// For a parent-only live demo/presentation: keeps the existing demo
// caregiver account (demo.caregiver@carelink.test / Abena Owusu,
// created by scripts/seed-demo.ts) continuously "Available" at a fixed
// East Legon location, and instantly accepts whatever pending request
// comes in addressed to them — all through the same public API routes
// a real caregiver's browser would call (POST /api/staff/dispatch-
// status, GET /api/bookings?status=pending, PATCH /api/bookings/[id]/
// accept), just without a browser. Nothing here is a shortcut around
// real backend logic: dispatch still runs its real eligibility/matching
// pass and the accept route still runs its real checks.
//
// Run this once, a few minutes before starting the parent-side demo,
// and leave it running in a terminal window you don't share on screen:
//   npm run demo:caregiver
// Stop it with Ctrl+C when you're done — it goes off duty cleanly on
// exit. Targets the real deployed CareLink backend by default, so this
// is meant to run against your live site, not just local dev.

const API_URL = process.env.CARELINK_API_URL ?? "https://carelink-backend-zeta.vercel.app";
const EMAIL = "demo.caregiver@carelink.test";
const PASSWORD = "Demo-Password-123!";

// East Legon, Accra — matches demo.caregiver's own declared primary
// area (staff_areas), so a parent request using "East Legon" as its
// care location lands comfortably within the dispatch vicinity radius
// (5km / 15km rounds — see dispatch-config.ts).
const LATITUDE = 5.65;
const LONGITUDE = -0.15;

const LOCATION_REFRESH_MS = 4 * 60 * 1000; // mirrors the real Go Available refresh interval
const POLL_MS = 3000;
const MAX_RUNTIME_MS = 45 * 60 * 1000; // safety net: goes off duty on its own if left running

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

// Last-resort safety net: whatever happens, this process must not die
// mid-presentation. Everything above already catches its own errors —
// this only exists in case something still slips through.
process.on("unhandledRejection", (err) => {
  console.error(
    `[${new Date().toLocaleTimeString()}] Unexpected error (ignored, still running):`,
    err,
  );
});
process.on("uncaughtException", (err) => {
  console.error(
    `[${new Date().toLocaleTimeString()}] Unexpected error (ignored, still running):`,
    err,
  );
});

async function main() {
  console.log(`Signing in as ${EMAIL}...`);
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("Sign-in failed");
  const token = data.session.access_token;
  console.log("Signed in.\n");

  // Every network call below is wrapped in try/catch and never throws
  // out of these functions — a transient network blip (a cold start, a
  // dropped connection) must never crash this process mid-presentation.
  // It just logs and tries again on the next tick.
  async function goAvailable() {
    try {
      const res = await fetch(`${API_URL}/api/staff/dispatch-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ available: true, latitude: LATITUDE, longitude: LONGITUDE }),
      });
      if (!res.ok) {
        console.error(
          `[${new Date().toLocaleTimeString()}] Failed to go available:`,
          await res.text(),
        );
      } else {
        console.log(
          `[${new Date().toLocaleTimeString()}] Available (East Legon) — location refreshed`,
        );
      }
    } catch (err) {
      console.error(
        `[${new Date().toLocaleTimeString()}] Network error going available (will retry):`,
        err,
      );
    }
  }

  async function goOffDuty() {
    try {
      await fetch(`${API_URL}/api/staff/dispatch-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ available: false }),
      });
    } catch {
      // best-effort on shutdown
    }
  }

  const acceptedIds = new Set<string>();
  async function checkAndAccept() {
    try {
      const res = await fetch(`${API_URL}/api/bookings?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { bookings } = (await res.json()) as { bookings: { id: string; reference: string }[] };
      for (const b of bookings ?? []) {
        if (acceptedIds.has(b.id)) continue;
        acceptedIds.add(b.id); // mark first, so a failed accept doesn't retry-storm every poll
        try {
          const acceptRes = await fetch(`${API_URL}/api/bookings/${b.id}/accept`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (acceptRes.ok) {
            console.log(
              `[${new Date().toLocaleTimeString()}] ACCEPTED ${b.reference} — check the parent screen now`,
            );
          } else {
            console.error(
              `[${new Date().toLocaleTimeString()}] Accept failed:`,
              await acceptRes.text(),
            );
          }
        } catch (err) {
          console.error(
            `[${new Date().toLocaleTimeString()}] Network error accepting (will retry):`,
            err,
          );
          acceptedIds.delete(b.id); // let the next poll retry this one
        }
      }
    } catch (err) {
      console.error(
        `[${new Date().toLocaleTimeString()}] Network error polling (will retry):`,
        err,
      );
    }
  }

  await goAvailable();
  const locationTimer = setInterval(() => void goAvailable(), LOCATION_REFRESH_MS);
  const pollTimer = setInterval(() => void checkAndAccept(), POLL_MS);
  const maxRuntimeTimer = setTimeout(async () => {
    clearInterval(locationTimer);
    clearInterval(pollTimer);
    await goOffDuty();
    console.log("\nAuto-stopped after 45 minutes — went off duty.");
    process.exit(0);
  }, MAX_RUNTIME_MS);

  console.log("Watching for new requests — switch to the parent browser now.");
  console.log("Press Ctrl+C to stop.\n");

  process.on("SIGINT", async () => {
    clearInterval(locationTimer);
    clearInterval(pollTimer);
    clearTimeout(maxRuntimeTimer);
    console.log("\nStopping — going off duty...");
    await goOffDuty();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
