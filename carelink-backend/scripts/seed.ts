import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";
import {
  generateInvitationCode,
  hashInvitationCode,
  placeholderStaffEmail,
} from "../lib/invitations";

config({ path: path.resolve(__dirname, "../.env.local") });

// Task 1.10. Scoped to what exists so far — users, parent_profiles,
// staff_profiles. Wards and bookings join this script once their
// migrations land (Sprint 2). Every seed identity uses a fixed phone
// number so the script can find and remove its own rows before
// recreating them, making `npm run seed` safely re-runnable, and every
// email lives under @carelink.seed so seed data is easy to spot anywhere
// it shows up (task 1.10: "seed rows are identifiable").

const SEED_PHONES = {
  admin: "+233550000001",
  parents: ["+233550000101", "+233550000102", "+233550000103"],
  invitedStaff: ["+233550000201", "+233550000202"],
  activeStaff: ["+233550000301", "+233550000302"],
};

const ALL_SEED_PHONES = [
  SEED_PHONES.admin,
  ...SEED_PHONES.parents,
  ...SEED_PHONES.invitedStaff,
  ...SEED_PHONES.activeStaff,
];

const SEED_PASSWORD = "Seed-Password-123!";

async function resetExistingSeedData(admin: ReturnType<typeof createServiceRoleClient>) {
  const { data: existing, error } = await admin
    .from("users")
    .select("id")
    .in("phone", ALL_SEED_PHONES);

  if (error) throw error;

  for (const row of existing ?? []) {
    const { error: deleteErr } = await admin.auth.admin.deleteUser(row.id);
    if (deleteErr) {
      console.error(`Failed to delete seed row ${row.id}:`, deleteErr.message);
    }
  }
  console.log(`Removed ${existing?.length ?? 0} existing seed row(s).`);

  // Supabase Auth's email-uniqueness check can briefly lag behind a
  // just-completed delete — recreating an identical email immediately
  // after can spuriously fail with "already registered". A short pause
  // is cheaper than building retry logic into a one-off seed script.
  if ((existing?.length ?? 0) > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const admin = createServiceRoleClient();
  await resetExistingSeedData(admin);

  // ── Administrator ────────────────────────────────────────────────────
  const { data: adminUser, error: adminErr } = await admin.auth.admin.createUser({
    email: "seed-admin@carelink.seed",
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: "Seed Administrator", phone: SEED_PHONES.admin },
  });
  if (adminErr || !adminUser.user) throw adminErr ?? new Error("Failed to create seed admin");
  console.log(`Admin        seed-admin@carelink.seed / ${SEED_PASSWORD}`);

  // ── Parents ──────────────────────────────────────────────────────────
  const parentAreas = ["East Legon", "Tema", "Adenta"];
  for (let i = 0; i < SEED_PHONES.parents.length; i++) {
    const phone = SEED_PHONES.parents[i];
    const { data: user, error } = await admin.auth.admin.createUser({
      email: `seed-parent-${i + 1}@carelink.seed`,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", full_name: `Seed Parent ${i + 1}`, phone },
    });
    if (error || !user.user) throw error ?? new Error("Failed to create seed parent");

    const { error: profileErr } = await admin.from("parent_profiles").insert({
      user_id: user.user.id,
      area: parentAreas[i % parentAreas.length],
      address: `${10 + i} Seed Street, ${parentAreas[i % parentAreas.length]}`,
      household_notes: "Seed data — friendly dog, gate code 1234.",
      emergency_contact_name: `Seed Emergency Contact ${i + 1}`,
      emergency_contact_phone: `+23355099900${i + 1}`,
      emergency_contact_relation: "Sibling",
    });
    if (profileErr) throw profileErr;
    console.log(`Parent       seed-parent-${i + 1}@carelink.seed / ${SEED_PASSWORD}`);
  }

  // ── Invited staff (roster record only, not yet claimed) ─────────────
  for (let i = 0; i < SEED_PHONES.invitedStaff.length; i++) {
    const phone = SEED_PHONES.invitedStaff[i];
    const code = generateInvitationCode();
    const { data: user, error } = await admin.auth.admin.createUser({
      email: placeholderStaffEmail(phone),
      password: generateInvitationCode(16),
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: `Seed Invited Caregiver ${i + 1}`,
        phone,
        account_status: "invited",
        invited_by: adminUser.user.id,
      },
    });
    if (error || !user.user) throw error ?? new Error("Failed to create invited staff");

    const { error: hashErr } = await admin
      .from("users")
      .update({ invitation_code_hash: hashInvitationCode(code) })
      .eq("id", user.user.id);
    if (hashErr) throw hashErr;

    console.log(
      `Invited staff ${phone} — invitation code: ${code} (POST /api/auth/claim-invitation to try it)`,
    );
  }

  // ── Active staff, with a complete profile ────────────────────────────
  const activeStaffData = [
    {
      bio: "Six years' experience with infants and toddlers. Calm, patient, and CPR certified.",
      years: 6,
      rate: 2500, // GH₵25.00 in pesewas
      languages: ["English", "Twi"],
    },
    {
      bio: "School-age supervision and homework support. Former teaching assistant.",
      years: 3,
      rate: 2000,
      languages: ["English", "Ga"],
    },
  ];
  for (let i = 0; i < SEED_PHONES.activeStaff.length; i++) {
    const phone = SEED_PHONES.activeStaff[i];
    const info = activeStaffData[i];
    const { data: user, error } = await admin.auth.admin.createUser({
      email: placeholderStaffEmail(phone),
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: `Seed Active Caregiver ${i + 1}`,
        phone,
        account_status: "active",
        invited_by: adminUser.user.id,
      },
    });
    if (error || !user.user) throw error ?? new Error("Failed to create active staff");

    const { error: profileErr } = await admin.from("staff_profiles").insert({
      user_id: user.user.id,
      bio: info.bio,
      years_experience: info.years,
      hourly_rate: info.rate,
      languages: info.languages,
      emergency_contact_name: `Seed Emergency Contact S${i + 1}`,
      emergency_contact_phone: `+23355098800${i + 1}`,
    });
    if (profileErr) throw profileErr;
    console.log(`Active staff seed-active-staff-${i + 1} (phone ${phone}) — profile complete`);
  }

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
