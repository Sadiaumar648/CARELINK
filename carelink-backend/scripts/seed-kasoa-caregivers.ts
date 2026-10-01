import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Adds demo caregivers based in Kasoa — every existing demo caregiver
// (seed-demo.ts, seed-demo-caregivers.ts) is based in and around Accra
// (East Legon, Cantonments, Adenta, etc.), so a request from Kasoa finds
// nobody within dispatch's 15km max vicinity radius (lib/dispatch-config.ts).
// Same technique as seed-demo-caregivers.ts: real schema fields only,
// @carelink.test domain, idempotent by email — but this also sets
// base_latitude/base_longitude and caregiver_type/accepting_bookings
// directly (seed-demo-caregivers.ts left those to a later script; doing
// it here in one pass means these are dispatch-eligible immediately).

const DEMO_PASSWORD = "Demo-Password-123!";

type CaregiverSeed = {
  email: string;
  fullName: string;
  phone: string;
  bio: string;
  years: number;
  rate: number;
  languages: string[];
  area: string;
  latitude: number;
  longitude: number;
  skills: string[];
  caregiverType: "nanny" | "babysitter";
};

// Kasoa spans several neighbourhoods along the Accra-Cape Coast highway
// (Gomoa East District, Central Region) — these three sit within a few
// km of each other, all realistically "Kasoa".
const CAREGIVERS: CaregiverSeed[] = [
  {
    email: "demo.caregiver11@carelink.test",
    fullName: "Grace Amponsah",
    phone: "+233551111020",
    bio: "Kasoa-based nanny with six years' experience across toddlers and school-age children. Homework routines, meal prep, and a calm, structured household.",
    years: 6,
    rate: 28,
    languages: ["English", "Twi", "Fante"],
    area: "Kasoa",
    latitude: 5.5325,
    longitude: -0.4167,
    skills: ["toddler_care", "school_age_supervision", "meal_preparation"],
    caregiverType: "nanny",
  },
  {
    email: "demo.caregiver12@carelink.test",
    fullName: "Comfort Asare",
    phone: "+233551111021",
    bio: "Infant and newborn specialist serving the Kasoa area. Gentle routines, feeding schedules, and light housekeeping included.",
    years: 5,
    rate: 26,
    languages: ["English", "Fante"],
    area: "Kasoa",
    latitude: 5.4999,
    longitude: -0.4489,
    skills: ["newborn_care", "infant_care", "light_housekeeping"],
    caregiverType: "nanny",
  },
  {
    email: "demo.caregiver13@carelink.test",
    fullName: "Emmanuel Ofori",
    phone: "+233551111022",
    bio: "After-school sitter in Kasoa Millennium City, three years' experience. Homework support and reliable pickup/drop-off routines.",
    years: 3,
    rate: 20,
    languages: ["English", "Twi"],
    area: "Kasoa",
    latitude: 5.5102,
    longitude: -0.4021,
    skills: ["school_age_supervision"],
    caregiverType: "babysitter",
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
        caregiver_type: c.caregiverType,
        accepting_bookings: true,
        base_latitude: c.latitude,
        base_longitude: c.longitude,
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

  console.log("\nKasoa demo caregivers ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
