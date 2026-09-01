import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Fills out the Find Care page with realistic, fully-profiled demo
// caregivers alongside the existing demo.caregiver@carelink.test
// (Abena Owusu, created by seed-demo.ts) — same technique, same
// @carelink.test domain (which the public_caregivers view's test-
// account exclusion, see the accompanying migration, explicitly never
// filters out), same idempotent-by-email, non-destructive behavior.
//
// Every field written here already exists in the schema (bio, rate,
// languages, skills from the real skill_tag enum, areas, availability
// windows) — nothing invented, no "caregiver type" field, no photo
// (no image asset to upload, so left null like any real profile
// without one — the Avatar component already handles that).

const DEMO_PASSWORD = "Demo-Password-123!";

type CaregiverSeed = {
  email: string;
  fullName: string;
  phone: string;
  bio: string;
  years: number;
  rate: number; // pesewas
  languages: string[];
  area: string;
  skills: string[];
};

const CAREGIVERS: CaregiverSeed[] = [
  {
    email: "demo.caregiver2@carelink.test",
    fullName: "Efua Asante",
    phone: "+233551111011",
    bio: "Newborn and infant specialist with maternity-support training. Gentle, structured routines and meticulous hygiene practices.",
    years: 8,
    rate: 3000,
    languages: ["English", "Twi", "Fante"],
    area: "Cantonments",
    skills: ["newborn_care", "infant_care", "meal_preparation"],
  },
  {
    email: "demo.caregiver3@carelink.test",
    fullName: "Kwame Boateng",
    phone: "+233551111012",
    bio: "Former primary school teaching assistant. Homework support, reading practice, and after-school supervision for school-age children.",
    years: 4,
    rate: 2200,
    languages: ["English", "Twi"],
    area: "Adenta",
    skills: ["school_age_supervision", "light_housekeeping"],
  },
  {
    email: "demo.caregiver4@carelink.test",
    fullName: "Adjoa Mensah",
    phone: "+233551111013",
    bio: "Ten years with toddlers and preschoolers. Calm with tantrums, big on outdoor play and early learning activities.",
    years: 10,
    rate: 2800,
    languages: ["English", "Twi", "Ga"],
    area: "Spintex",
    skills: ["toddler_care", "meal_preparation", "light_housekeeping"],
  },
  {
    email: "demo.caregiver5@carelink.test",
    fullName: "Yaw Darko",
    phone: "+233551111014",
    bio: "CPR and first-aid certified. Experienced with children who have additional support needs, and comfortable with medication schedules.",
    years: 6,
    rate: 3200,
    languages: ["English", "Twi"],
    area: "Dansoman",
    skills: ["special_needs_care", "toddler_care"],
  },
  {
    email: "demo.caregiver6@carelink.test",
    fullName: "Akosua Frimpong",
    phone: "+233551111015",
    bio: "Warm and reliable, three years' experience with infants through school age. Enjoys cooking and involving children in simple meal prep.",
    years: 3,
    rate: 1900,
    languages: ["English", "Ga"],
    area: "Osu",
    skills: ["infant_care", "meal_preparation", "school_age_supervision"],
  },
  {
    email: "demo.caregiver7@carelink.test",
    fullName: "Kojo Appiah",
    phone: "+233551111016",
    bio: "Seven years as a live-out nanny for busy dual-income households. Structured routines, homework help, and light housekeeping included.",
    years: 7,
    rate: 2600,
    languages: ["English", "Twi", "Ewe"],
    area: "Achimota",
    skills: ["school_age_supervision", "toddler_care", "light_housekeeping"],
  },
  {
    email: "demo.caregiver8@carelink.test",
    fullName: "Ama Nyarko",
    phone: "+233551111017",
    bio: "Early-years specialist with a background in childcare training. Patient, playful, and experienced with twins and multiples.",
    years: 9,
    rate: 3100,
    languages: ["English", "Twi"],
    area: "Labone",
    skills: ["infant_care", "toddler_care", "newborn_care"],
  },
  {
    email: "demo.caregiver9@carelink.test",
    fullName: "Kwabena Osei",
    phone: "+233551111018",
    bio: "Dependable and punctual, two years' experience with school-age children. Strong focus on homework routines and screen-time balance.",
    years: 2,
    rate: 1800,
    languages: ["English", "Twi"],
    area: "Tema",
    skills: ["school_age_supervision"],
  },
  {
    email: "demo.caregiver10@carelink.test",
    fullName: "Abigail Tetteh",
    phone: "+233551111019",
    bio: "Five years across infant and toddler care. Meal prep, light housekeeping, and a genuinely calm presence with fussy sleepers.",
    years: 5,
    rate: 2400,
    languages: ["English", "Ga", "Twi"],
    area: "East Legon",
    skills: ["infant_care", "toddler_care", "meal_preparation", "light_housekeeping"],
  },
];

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

  for (const c of CAREGIVERS) {
    const existingId = await findExistingUserId(admin, c.email);
    if (existingId) {
      console.log(`SKIP  ${c.fullName} already exists (${c.email}) — id ${existingId}`);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: c.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: c.fullName,
        phone: c.phone,
        account_status: "active",
      },
    });
    if (error || !data.user) throw error ?? new Error(`Failed to create ${c.fullName}`);
    const userId = data.user.id;

    await admin.from("users").update({ verification_status: "verified" }).eq("id", userId);

    const { data: staffProfile, error: profileErr } = await admin
      .from("staff_profiles")
      .insert({
        user_id: userId,
        bio: c.bio,
        years_experience: c.years,
        hourly_rate: c.rate,
        languages: c.languages,
        emergency_contact_name: "Demo Emergency Contact",
        emergency_contact_phone: "+233551111098",
      })
      .select("id")
      .single();
    if (profileErr || !staffProfile)
      throw profileErr ?? new Error(`Failed to create profile for ${c.fullName}`);

    const { error: areaErr } = await admin
      .from("staff_areas")
      .insert({ staff_profile_id: staffProfile.id, area: c.area, is_primary: true });
    if (areaErr) throw areaErr;

    const { error: skillsErr } = await admin
      .from("staff_skills")
      .insert(c.skills.map((skill) => ({ staff_profile_id: staffProfile.id, skill })));
    if (skillsErr) throw skillsErr;

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

    console.log(`CREATED ${c.fullName}  ${c.email}  id ${userId}`);
  }

  console.log("\nDemo caregivers ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
