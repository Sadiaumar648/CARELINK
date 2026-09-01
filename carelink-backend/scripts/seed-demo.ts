import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Creates the three named demo/test accounts requested for an
// end-to-end CareLink walkthrough (SafeTrack, SOS, admin oversight).
// Uses the exact same primitive scripts/seed.ts already relies on
// (createServiceRoleClient().auth.admin.createUser, which the existing
// handle_new_auth_user trigger turns into a public.users row from
// user_metadata — the same path every real signup goes through) rather
// than inventing a new account-creation mechanism.
//
// Deliberately NOT reusing the /api/admin/staff invite flow for the
// caregiver: that route always generates a hidden placeholder email
// (see lib/invitations.ts) specifically to avoid needing an SMS
// provider for real invitations — a real, sensible constraint that
// doesn't apply to a single manually-run demo fixture, and isn't one
// this script changes.
//
// Idempotent by email, not destructive: if an account already exists
// it's reported and left untouched, never recreated or deleted (unlike
// seed.ts's own reset-and-recreate behavior for its generic fixtures).
// Safe to re-run.

const DEMO_PASSWORD = "Demo-Password-123!";

const ACCOUNTS = {
  admin: {
    email: "demo.admin@carelink.test",
    fullName: "CareLink Admin",
    phone: "+233551111001",
  },
  parent: {
    email: "demo.parent@carelink.test",
    fullName: "Ama Mensah",
    phone: "+233551111002",
  },
  caregiver: {
    email: "demo.caregiver@carelink.test",
    fullName: "Abena Owusu",
    phone: "+233551111003",
  },
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const PARTS: {
  part: "morning" | "afternoon" | "evening" | "overnight";
  startTime: string;
  endTime: string;
}[] = [
  { part: "morning", startTime: "06:00", endTime: "12:00" },
  { part: "afternoon", startTime: "12:00", endTime: "17:00" },
  { part: "evening", startTime: "17:00", endTime: "21:00" },
  { part: "overnight", startTime: "21:00", endTime: "23:45" },
];

async function findExistingUserId(
  admin: ReturnType<typeof createServiceRoleClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function main() {
  const admin = createServiceRoleClient();

  // ── Admin ────────────────────────────────────────────────────────────
  const existingAdminId = await findExistingUserId(admin, ACCOUNTS.admin.email);
  if (existingAdminId) {
    console.log(`SKIP  admin already exists (${ACCOUNTS.admin.email}) — id ${existingAdminId}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ACCOUNTS.admin.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "admin",
        full_name: ACCOUNTS.admin.fullName,
        phone: ACCOUNTS.admin.phone,
      },
    });
    if (error || !data.user) throw error ?? new Error("Failed to create demo admin");
    console.log(`CREATED admin  ${ACCOUNTS.admin.email}  id ${data.user.id}`);
  }

  // ── Parent ───────────────────────────────────────────────────────────
  let parentUserId = await findExistingUserId(admin, ACCOUNTS.parent.email);
  if (parentUserId) {
    console.log(`SKIP  parent already exists (${ACCOUNTS.parent.email}) — id ${parentUserId}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ACCOUNTS.parent.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "parent",
        full_name: ACCOUNTS.parent.fullName,
        phone: ACCOUNTS.parent.phone,
      },
    });
    if (error || !data.user) throw error ?? new Error("Failed to create demo parent");
    parentUserId = data.user.id;

    await admin.from("users").update({ verification_status: "verified" }).eq("id", parentUserId);

    const { error: profileErr } = await admin.from("parent_profiles").insert({
      user_id: parentUserId,
      area: "East Legon",
      address: "12 Demo Close, East Legon, Accra",
      household_notes: "DEMO/TEST account — not a real family.",
      emergency_contact_name: "Demo Emergency Contact",
      emergency_contact_phone: "+233551111099",
      emergency_contact_relation: "Sibling",
    });
    if (profileErr) throw profileErr;

    const { error: wardErr } = await admin.from("wards").insert({
      parent_profile_id: (
        await admin.from("parent_profiles").select("id").eq("user_id", parentUserId).single()
      ).data!.id,
      display_name: "Demo Child",
      age_years: 4,
      general_notes: "DEMO/TEST ward — not a real child.",
    });
    if (wardErr) throw wardErr;

    console.log(
      `CREATED parent ${ACCOUNTS.parent.email}  id ${parentUserId}  (+ profile, +1 ward)`,
    );
  }

  // ── Caregiver ────────────────────────────────────────────────────────
  let caregiverUserId = await findExistingUserId(admin, ACCOUNTS.caregiver.email);
  if (caregiverUserId) {
    console.log(
      `SKIP  caregiver already exists (${ACCOUNTS.caregiver.email}) — id ${caregiverUserId}`,
    );
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ACCOUNTS.caregiver.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: ACCOUNTS.caregiver.fullName,
        phone: ACCOUNTS.caregiver.phone,
        account_status: "active",
      },
    });
    if (error || !data.user) throw error ?? new Error("Failed to create demo caregiver");
    caregiverUserId = data.user.id;

    await admin.from("users").update({ verification_status: "verified" }).eq("id", caregiverUserId);

    const { data: staffProfile, error: profileErr } = await admin
      .from("staff_profiles")
      .insert({
        user_id: caregiverUserId,
        // No structured "caregiver type" field exists anywhere in the
        // schema (confirmed by inspection) — described here in the bio
        // instead of inventing a new column.
        bio: "DEMO/TEST account. Experienced nanny — infant and toddler care, meal prep, and light housekeeping.",
        years_experience: 5,
        // A realistic Ghanaian hourly rate: every consumer of this
        // column (frontend display, the budget-fit matcher, the
        // booking-total calculation) treats it as whole cedis, not
        // pesewas — despite scripts/seed.ts's own comment suggesting
        // otherwise. See scripts/fix-demo-rates.ts for the full
        // reasoning and for correcting an already-seeded value.
        hourly_rate: 50,
        languages: ["English", "Twi"],
        emergency_contact_name: "Demo Emergency Contact",
        emergency_contact_phone: "+233551111098",
      })
      .select("id")
      .single();
    if (profileErr || !staffProfile)
      throw profileErr ?? new Error("Failed to create staff profile");

    const { error: areaErr } = await admin
      .from("staff_areas")
      .insert({ staff_profile_id: staffProfile.id, area: "East Legon", is_primary: true });
    if (areaErr) throw areaErr;

    const { error: skillsErr } = await admin.from("staff_skills").insert(
      ["infant_care", "toddler_care", "meal_preparation"].map((skill) => ({
        staff_profile_id: staffProfile.id,
        skill,
      })),
    );
    if (skillsErr) throw skillsErr;

    // Every day, every part — so any date/time picked during manual
    // testing passes the real availability check, not a fabricated one.
    const windows = WEEKDAYS.flatMap((weekday) =>
      PARTS.map((p) => ({
        staff_profile_id: staffProfile.id,
        weekday,
        part: p.part,
        start_time: p.startTime,
        end_time: p.endTime,
      })),
    );
    const { error: windowsErr } = await admin.from("availability_windows").insert(windows);
    if (windowsErr) throw windowsErr;

    console.log(
      `CREATED caregiver ${ACCOUNTS.caregiver.email}  id ${caregiverUserId}  (+ profile, +1 area, +3 skills, +${windows.length} availability windows)`,
    );
  }

  console.log("\nDemo accounts ready.");
  console.log(`Password for all three: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
