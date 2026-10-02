import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Every demo caregiver seeded so far (seed-demo.ts, seed-demo-
// caregivers.ts, seed-kasoa-caregivers.ts) declares the same four
// availability_windows parts per weekday — morning 06:00-12:00,
// afternoon 12:00-17:00, evening 17:00-21:00, overnight 21:00-23:45 —
// which leaves a real, undeclared gap from 00:00 to 06:00 every day.
// checkAvailability() (lib/services/availability.ts) correctly reads
// this as "outside declared hours" for any request that falls in that
// gap, which is accurate dispatch behaviour, not a bug — but it means
// a demo request spanning midnight (e.g. 00:10-08:10) can find nobody
// even in an area with several seeded, otherwise-eligible caregivers.
//
// This closes the gap for every existing demo caregiver by adding the
// missing 00:00-06:00 window per weekday — idempotent: skips any
// weekday that already has a window starting at or before 00:00.
// Reuses the 'overnight' day_part label (no new enum value, no
// migration) since checkAvailability only ever reads start_time/
// end_time, never the part label itself.

async function main() {
  const admin = createServiceRoleClient();

  const { data: staffUsers, error: usersErr } = await admin
    .from("users")
    .select("id")
    .eq("role", "staff")
    .ilike("email", "%@carelink.test");
  if (usersErr) throw usersErr;
  const userIds = (staffUsers ?? []).map((u) => u.id);
  if (userIds.length === 0) {
    console.log("No demo caregivers found.");
    return;
  }

  const { data: profiles, error: profilesErr } = await admin
    .from("staff_profiles")
    .select("id, user_id")
    .in("user_id", userIds);
  if (profilesErr) throw profilesErr;

  for (const profile of profiles ?? []) {
    const { data: windows, error: windowsErr } = await admin
      .from("availability_windows")
      .select("weekday, start_time")
      .eq("staff_profile_id", profile.id);
    if (windowsErr) throw windowsErr;

    const weekdaysAlreadyCovered = new Set(
      (windows ?? []).filter((w) => w.start_time <= "00:00:00").map((w) => w.weekday),
    );

    const toInsert = [0, 1, 2, 3, 4, 5, 6]
      .filter((weekday) => !weekdaysAlreadyCovered.has(weekday))
      .map((weekday) => ({
        staff_profile_id: profile.id,
        weekday,
        part: "overnight" as const,
        start_time: "00:00",
        end_time: "06:00",
      }));

    if (toInsert.length === 0) {
      console.log(`SKIP  ${profile.id} — already covers 00:00 on every weekday`);
      continue;
    }

    const { error: insertErr } = await admin.from("availability_windows").insert(toInsert);
    if (insertErr) throw insertErr;
    console.log(`OK    ${profile.id} — added ${toInsert.length} midnight-6am window(s)`);
  }

  console.log("\nDone — every demo caregiver now covers 24 hours a day.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
