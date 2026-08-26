import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 2.6, 2.8, 2.9 — the hard filter, ranked
// results with a score breakdown, and the public caregiver profile.
// Run against the real dev server.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

const admin = createServiceRoleClient();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

async function createActiveStaff(config: {
  area: string;
  secondaryArea?: string;
  skills: string[];
  rate: number;
  years: number;
}) {
  const email = `carelink-test-search-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "Search Test Staff",
      phone: randomPhone(),
      account_status: "active",
    },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create staff");
  await admin.from("users").update({ verification_status: "verified" }).eq("id", data.user.id);

  const { data: profile, error: profileErr } = await admin
    .from("staff_profiles")
    .insert({
      user_id: data.user.id,
      years_experience: config.years,
      hourly_rate: config.rate,
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();
  if (profileErr) throw profileErr;

  if (config.skills.length > 0) {
    await admin
      .from("staff_skills")
      .insert(config.skills.map((skill) => ({ staff_profile_id: profile.id, skill })));
  }

  const areas = [{ staff_profile_id: profile.id, area: config.area, is_primary: true }];
  if (config.secondaryArea) {
    areas.push({ staff_profile_id: profile.id, area: config.secondaryArea, is_primary: false });
  }
  await admin.from("staff_areas").insert(areas);

  return { userId: data.user.id, staffProfileId: profile.id as string };
}

async function createParentSession() {
  const email = `carelink-test-search-parent-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "Search Test Parent", phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create parent");

  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("Failed to sign in parent");

  return { id: data.user.id, accessToken: signIn.session.access_token };
}

describe("search and caregiver profile (tasks 2.6, 2.8, 2.9)", () => {
  let staffA: { userId: string; staffProfileId: string }; // East Legon primary, toddler_care + meal_prep, 2000, 5yrs
  let staffB: { userId: string; staffProfileId: string }; // Tema primary, toddler_care, 3000, 2yrs
  let staffC: { userId: string; staffProfileId: string }; // Adenta primary / East Legon secondary, infant_care, 1500, 8yrs
  let parent: { id: string; accessToken: string };

  beforeAll(async () => {
    [staffA, staffB, staffC, parent] = await Promise.all([
      createActiveStaff({
        area: "East Legon",
        skills: ["toddler_care", "meal_preparation"],
        rate: 2000,
        years: 5,
      }),
      createActiveStaff({ area: "Tema", skills: ["toddler_care"], rate: 3000, years: 2 }),
      createActiveStaff({
        area: "Adenta",
        secondaryArea: "East Legon",
        skills: ["infant_care"],
        rate: 1500,
        years: 8,
      }),
      createParentSession(),
    ]);
  }, 40000);

  afterAll(async () => {
    await Promise.all([staffA, staffB, staffC].map((s) => admin.auth.admin.deleteUser(s.userId)));
    await admin.auth.admin.deleteUser(parent.id);
  });

  async function search(query: string) {
    const res = await fetch(`${BASE_URL}/api/search/caregivers?${query}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    return { status: res.status, body: await res.json() };
  }

  it("excludes a caregiver who doesn't serve the requested area", async () => {
    const { status, body } = await search("area=East%20Legon");
    expect(status).toBe(200);
    const ids = body.results.map((r: { staff_profile_id: string }) => r.staff_profile_id);
    expect(ids).toContain(staffA.staffProfileId);
    expect(ids).toContain(staffC.staffProfileId); // secondary area still matches
    expect(ids).not.toContain(staffB.staffProfileId);
  });

  it("filters by skill, from the fixed vocabulary", async () => {
    const { body } = await search("skills=toddler_care");
    const ids = body.results.map((r: { staff_profile_id: string }) => r.staff_profile_id);
    expect(ids.sort()).toEqual([staffA.staffProfileId, staffB.staffProfileId].sort());
  });

  it("filters by budget ceiling", async () => {
    const { body } = await search("budgetCeiling=1800");
    const ids = body.results.map((r: { staff_profile_id: string }) => r.staff_profile_id);
    expect(ids).toEqual([staffC.staffProfileId]);
  });

  it("ranks a primary-area match above a secondary-area match, all else being closer to equal", async () => {
    const { body } = await search("area=East%20Legon");
    const scoreA = body.results.find(
      (r: { staff_profile_id: string }) => r.staff_profile_id === staffA.staffProfileId,
    ).matchScore;
    const scoreC = body.results.find(
      (r: { staff_profile_id: string }) => r.staff_profile_id === staffC.staffProfileId,
    ).matchScore;
    expect(scoreA).toBeGreaterThan(scoreC);
  });

  it("returns a score breakdown that sums to the total", async () => {
    const { body } = await search("area=East%20Legon");
    const result = body.results[0];
    const sum =
      result.matchBreakdown.availability +
      result.matchBreakdown.area +
      result.matchBreakdown.skills +
      result.matchBreakdown.ratingExperience +
      result.matchBreakdown.budget;
    expect(sum).toBeCloseTo(result.matchScore, 1);
  });

  it("names the most restrictive filter and offers to relax it when nothing matches", async () => {
    const { body } = await search("area=Kumasi");
    expect(body.results).toHaveLength(0);
    expect(body.emptyState.restrictiveFilter).toBe("area");
    expect(body.emptyState.message).toBeTruthy();
  });

  it("excludes an unverified caregiver entirely (task 3.3)", async () => {
    const email = `carelink-test-search-unverified-${Date.now()}@example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: "Unverified Staff",
        phone: randomPhone(),
        account_status: "active",
      },
    });
    await admin.from("staff_profiles").insert({
      user_id: data!.user!.id,
      hourly_rate: 2000,
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    });

    const { body } = await search("");
    const ids = body.results.map((r: { user_id: string }) => r.user_id);
    expect(ids).not.toContain(data!.user!.id);

    await admin.auth.admin.deleteUser(data!.user!.id);
  });

  it("excludes an inactive (unclaimed) staff record entirely", async () => {
    const email = `carelink-test-search-invited-${Date.now()}@example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: "Invited Only",
        phone: randomPhone(),
        account_status: "invited",
      },
    });

    const { body } = await search("");
    const ids = body.results.map((r: { user_id: string }) => r.user_id);
    expect(ids).not.toContain(data!.user!.id);

    await admin.auth.admin.deleteUser(data!.user!.id);
  });

  it("serves a caregiver's public profile with only public fields", async () => {
    const res = await fetch(`${BASE_URL}/api/caregivers/${staffA.staffProfileId}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.caregiver.years_experience).toBe(5);
    expect(body.caregiver).not.toHaveProperty("emergency_contact_phone");
  });

  it("404s for a caregiver that doesn't exist", async () => {
    const res = await fetch(`${BASE_URL}/api/caregivers/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect(res.status).toBe(404);
  });
});
