import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// One-off correction, not a new mechanism: staff_profiles.hourly_rate,
// bookings.total_amount, and payments.amount are all treated as plain
// whole-cedis integers everywhere they're actually read (confirmed by
// inspection — no consumer, frontend or backend, ever divides by 100),
// despite scripts/seed.ts's own comment describing the value as
// pesewas. seed-demo.ts and seed-demo-caregivers.ts copied that same
// (for this app, incorrect) convention, seeding hourly_rate values like
// 2500 that a plain "GH₵{hourly_rate}/hr" render shows as GH₵2,500 —
// exactly the unrealistic figure being corrected here. Only the ten
// demo caregivers' stored rates are touched; nothing about how a rate
// is calculated or displayed changes, and an existing accepted booking
// keeps its own already-snapshotted rate/total regardless (enforced by
// the database's own terms-lock trigger, not by anything in this
// script).
const RATES: Record<string, number> = {
  "demo.caregiver@carelink.test": 50, // Abena Owusu
  "demo.caregiver2@carelink.test": 40, // Efua Asante
  "demo.caregiver3@carelink.test": 25, // Kwame Boateng
  "demo.caregiver4@carelink.test": 30, // Adjoa Mensah
  "demo.caregiver5@carelink.test": 38, // Yaw Darko
  "demo.caregiver6@carelink.test": 22, // Akosua Frimpong
  "demo.caregiver7@carelink.test": 32, // Kojo Appiah
  "demo.caregiver8@carelink.test": 35, // Ama Nyarko
  "demo.caregiver9@carelink.test": 20, // Kwabena Osei
  "demo.caregiver10@carelink.test": 30, // Abigail Tetteh
};

async function main() {
  const admin = createServiceRoleClient();
  const emails = Object.keys(RATES);

  const { data: users, error: usersErr } = await admin
    .from("users")
    .select("id, email, full_name")
    .in("email", emails);
  if (usersErr) throw usersErr;

  for (const email of emails) {
    const user = users.find((u) => u.email === email);
    if (!user) {
      console.log(`SKIP  no user found for ${email}`);
      continue;
    }
    const { data, error } = await admin
      .from("staff_profiles")
      .update({ hourly_rate: RATES[email] })
      .eq("user_id", user.id)
      .select("hourly_rate")
      .single();
    if (error) throw error;
    console.log(`UPDATED ${user.full_name} (${email}) -> GH₵${data.hourly_rate}/hr`);
  }

  console.log("\nDemo rates corrected.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
