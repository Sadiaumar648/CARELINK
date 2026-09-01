import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Fills in the two structured fields the caregiver_type/qualifications
// migration (20260902000000) added, for the 10 existing demo caregivers
// created by seed-demo.ts (Abena Owusu) and seed-demo-caregivers.ts (the
// other 9). Does not create, delete, or rename any account, and does not
// touch bio/rate/skills/areas/availability — those were already set by
// the seed scripts and are left exactly as they are.
//
// caregiver_type is assigned by re-reading each caregiver's own existing
// bio, never invented: several bios already say "nanny" outright (Abena
// Owusu, Kojo Appiah) or describe ongoing dedicated infant/toddler care
// (Efua Asante, Adjoa Mensah, Yaw Darko, Ama Nyarko, Abigail Tetteh) —
// those become "nanny". The other three describe after-school/homework
// supervision or flexible sitting across ages, which is what
// "babysitter" means in this app's own onboarding copy — those become
// "babysitter".
//
// Qualifications are added only where a bio already references specific
// training (maternity-support training, CPR/first-aid certification,
// childcare training) — three of the ten, deliberately not all of them,
// per the instruction not to invent a qualification for every profile.
// Institution names are plausible Ghanaian organisations for a demo
// account, not a claim about a real institution.

type CaregiverUpdate = {
  email: string;
  caregiverType: "nanny" | "babysitter";
  qualifications?: { name: string; institution: string; year: number }[];
};

const UPDATES: CaregiverUpdate[] = [
  { email: "demo.caregiver@carelink.test", caregiverType: "nanny" }, // Abena Owusu — bio says "Experienced nanny"
  {
    email: "demo.caregiver2@carelink.test", // Efua Asante
    caregiverType: "nanny",
    qualifications: [
      {
        name: "Maternity & Newborn Support Training",
        institution: "Ghana Health Service Maternity Care Programme",
        year: 2016,
      },
    ],
  },
  { email: "demo.caregiver3@carelink.test", caregiverType: "babysitter" }, // Kwame Boateng — after-school supervision
  { email: "demo.caregiver4@carelink.test", caregiverType: "nanny" }, // Adjoa Mensah — ongoing toddler/preschool care
  {
    email: "demo.caregiver5@carelink.test", // Yaw Darko
    caregiverType: "nanny",
    qualifications: [
      { name: "First Aid & CPR Certification", institution: "Ghana Red Cross Society", year: 2019 },
    ],
  },
  { email: "demo.caregiver6@carelink.test", caregiverType: "babysitter" }, // Akosua Frimpong — flexible, infant through school age
  { email: "demo.caregiver7@carelink.test", caregiverType: "nanny" }, // Kojo Appiah — bio says "live-out nanny"
  {
    email: "demo.caregiver8@carelink.test", // Ama Nyarko
    caregiverType: "nanny",
    qualifications: [
      {
        name: "Childcare Training Certificate",
        institution: "Ghana Early Childhood Development Network",
        year: 2015,
      },
    ],
  },
  { email: "demo.caregiver9@carelink.test", caregiverType: "babysitter" }, // Kwabena Osei — homework routines, screen-time
  { email: "demo.caregiver10@carelink.test", caregiverType: "nanny" }, // Abigail Tetteh — ongoing infant/toddler care
];

async function main() {
  const admin = createServiceRoleClient();

  for (const u of UPDATES) {
    const { data: user, error: userErr } = await admin
      .from("users")
      .select("id, full_name")
      .eq("email", u.email)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!user) {
      console.log(`SKIP  no user found for ${u.email} — not touching anything`);
      continue;
    }

    const { data: profile, error: profileErr } = await admin
      .from("staff_profiles")
      .select("id, caregiver_type")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile) {
      console.log(`SKIP  no staff_profile found for ${user.full_name} (${u.email})`);
      continue;
    }

    const { error: updateErr } = await admin
      .from("staff_profiles")
      .update({ caregiver_type: u.caregiverType })
      .eq("id", profile.id);
    if (updateErr) throw updateErr;
    console.log(`OK    ${user.full_name}: caregiver_type = ${u.caregiverType}`);

    if (u.qualifications?.length) {
      const { data: existing, error: existingErr } = await admin
        .from("caregiver_qualifications")
        .select("id")
        .eq("staff_profile_id", profile.id);
      if (existingErr) throw existingErr;
      if (existing && existing.length > 0) {
        console.log(
          `      SKIP qualifications for ${user.full_name} — ${existing.length} already present`,
        );
        continue;
      }

      const { error: qualErr } = await admin.from("caregiver_qualifications").insert(
        u.qualifications.map((q) => ({
          staff_profile_id: profile.id,
          name: q.name,
          institution: q.institution,
          year: q.year,
          // Same agency that already verified these caregivers' identity
          // vouches for the training they list, matching users.verification_method = 'agency' for these accounts.
          verification_status: "verified" as const,
        })),
      );
      if (qualErr) throw qualErr;
      console.log(`      + ${u.qualifications.length} qualification(s) for ${user.full_name}`);
    }
  }

  console.log("\nDemo caregiver profiles completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
