import { config } from "dotenv";
import path from "node:path";

import { createServiceRoleClient } from "../lib/db/supabase-server";

config({ path: path.resolve(__dirname, "../.env.local") });

// Only 3 caregivers platform-wide offered 'toddler_care' before this
// script (Grace Amponsah, Ama Mansa, Esther Oppong) — a parent making
// several overlapping toddler-care requests in a row could genuinely
// exhaust all 3 and get "No caregiver is available," a real capacity
// gap rather than a bug. Adds 3 more nanny accounts with toddler_care
// among their skills, spread across different Accra-area locations.
// Same technique as seed-kasoa-caregivers.ts: real schema fields only,
// @carelink.test domain, idempotent by email, base_latitude/longitude
// and caregiver_type/accepting_bookings set directly so these are
// dispatch-eligible immediately. Unlike that script, this one also
// covers the full 00:00-06:00 window (closed platform-wide by
// close-overnight-availability-gap.ts for everyone that existed before
// it ran) and uploads a real photo — public_caregivers requires
// photo_path is not null to appear in search/dispatch at all
// (20260923000000_caregiver_photo_required_for_visibility.sql).

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
  avatarColor: string;
};

const CAREGIVERS: CaregiverSeed[] = [
  {
    email: "demo.caregiver14@carelink.test",
    fullName: "Abena Owusu",
    phone: "+233551111023",
    bio: "East Legon-based nanny, seven years' experience with toddlers and newborns. Calm, patient, and big on routine.",
    years: 7,
    rate: 30,
    languages: ["English", "Twi"],
    area: "East Legon",
    latitude: 5.6505,
    longitude: -0.1499,
    skills: ["toddler_care", "newborn_care", "meal_preparation"],
    avatarColor: "#5b8c5a",
  },
  {
    email: "demo.caregiver15@carelink.test",
    fullName: "Afia Boateng",
    phone: "+233551111024",
    bio: "Spintex-based nanny with four years' experience across toddlers and school-age children. Homework help and active play routines.",
    years: 4,
    rate: 27,
    languages: ["English", "Ga", "Twi"],
    area: "Spintex",
    latitude: 5.6238,
    longitude: -0.1109,
    skills: ["toddler_care", "school_age_supervision"],
    avatarColor: "#c27a3a",
  },
  {
    email: "demo.caregiver16@carelink.test",
    fullName: "Linda Appiah",
    phone: "+233551111025",
    bio: "Tema-based nanny, five years' experience with toddlers. Light housekeeping and meal prep included.",
    years: 5,
    rate: 26,
    languages: ["English", "Ewe"],
    area: "Tema",
    latitude: 5.6698,
    longitude: -0.0166,
    skills: ["toddler_care", "light_housekeeping"],
    avatarColor: "#3a6ea5",
  },
];

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const PARTS: {
  part: "morning" | "afternoon" | "evening" | "overnight";
  startTime: string;
  endTime: string;
}[] = [
  { part: "overnight", startTime: "00:00", endTime: "06:00" },
  { part: "morning", startTime: "06:00", endTime: "12:00" },
  { part: "afternoon", startTime: "12:00", endTime: "17:00" },
  { part: "evening", startTime: "17:00", endTime: "21:00" },
  { part: "overnight", startTime: "21:00", endTime: "23:45" },
];

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarSvg(fullName: string, color: string): string {
  const text = initials(fullName);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <circle cx="100" cy="100" r="100" fill="${color}" />
  <text x="100" y="100" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="80" font-weight="600" fill="#ffffff">${text}</text>
</svg>`;
}

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
        caregiver_type: "nanny",
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

    const photoPath = `${userId}/photo-${Date.now()}.svg`;
    const { error: uploadErr } = await admin.storage
      .from("profile-photos")
      .upload(photoPath, Buffer.from(avatarSvg(c.fullName, c.avatarColor)), {
        contentType: "image/svg+xml",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;
    const { error: photoUpdateErr } = await admin
      .from("staff_profiles")
      .update({ photo_path: photoPath })
      .eq("id", staffProfile.id);
    if (photoUpdateErr) throw photoUpdateErr;

    console.log(`CREATED ${c.fullName}  ${c.email}  id ${userId}`);
  }

  console.log("\nAdditional toddler-care demo caregivers ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
