import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 2.1-2.3, run against the real dev server.
// Start `npm run dev --workspace carelink-backend` before running this file.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createStaffSession() {
  const admin = createServiceRoleClient();
  const email = `carelink-test-staff-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "Test Caregiver",
      phone: randomPhone(),
      account_status: "active",
    },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create staff user");

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("Failed to sign in staff user");

  return { id: data.user.id, accessToken: signIn.session.access_token };
}

describe("staff profile, skills, areas, availability (tasks 2.1-2.3)", () => {
  let staffId: string;
  let token: string;

  beforeAll(async () => {
    const staff = await createStaffSession();
    staffId = staff.id;
    token = staff.accessToken;
  }, 30000);

  afterAll(async () => {
    const admin = createServiceRoleClient();
    await admin.auth.admin.deleteUser(staffId);
  });

  it("has no profile before the first save", async () => {
    const res = await fetch(`${BASE_URL}/api/staff/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile).toBeNull();
  });

  it("creates a profile on first PATCH, and it persists and reloads correctly", async () => {
    const patchRes = await fetch(`${BASE_URL}/api/staff/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        bio: "Six years of experience with toddlers.",
        yearsExperience: 6,
        hourlyRate: 2500,
        languages: ["English", "Twi"],
        emergencyContactName: "Ama Test",
        emergencyContactPhone: "+233550009999",
      }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await fetch(`${BASE_URL}/api/staff/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await getRes.json();
    expect(body.profile.hourly_rate).toBe(2500);
    expect(body.profile.years_experience).toBe(6);
    expect(body.profile.languages).toEqual(["English", "Twi"]);
  });

  it("rejects a zero or negative rate at the field", async () => {
    const res = await fetch(`${BASE_URL}/api/staff/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        yearsExperience: 1,
        hourlyRate: 0,
        emergencyContactName: "X",
        emergencyContactPhone: "+233550000000",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("stores skill tags as rows, from the fixed vocabulary only", async () => {
    const putRes = await fetch(`${BASE_URL}/api/staff/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ skills: ["toddler_care", "meal_preparation"] }),
    });
    expect(putRes.status).toBe(200);

    const badRes = await fetch(`${BASE_URL}/api/staff/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ skills: ["not_a_real_skill"] }),
    });
    expect(badRes.status).toBe(400);

    const getRes = await fetch(`${BASE_URL}/api/staff/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await getRes.json();
    expect(body.skills.sort()).toEqual(["meal_preparation", "toddler_care"]);
  });

  it("normalizes service areas to exactly one primary", async () => {
    const putRes = await fetch(`${BASE_URL}/api/staff/areas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        areas: [
          { area: "East Legon", isPrimary: false },
          { area: "Tema", isPrimary: true },
          { area: "Adenta", isPrimary: true },
        ],
      }),
    });
    const body = await putRes.json();
    expect(putRes.status).toBe(200);
    const primaries = body.areas.filter((a: { isPrimary: boolean }) => a.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].area).toBe("Tema");
  });

  it("persists a weekly availability grid and refuses an end time before its start", async () => {
    const putRes = await fetch(`${BASE_URL}/api/staff/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        windows: [{ weekday: 1, part: "afternoon", startTime: "14:00", endTime: "18:00" }],
        exceptions: [{ onDate: "2026-12-25", unavailable: true, note: "Christmas" }],
      }),
    });
    expect(putRes.status).toBe(200);

    const invalidRes = await fetch(`${BASE_URL}/api/staff/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        windows: [{ weekday: 1, part: "afternoon", startTime: "18:00", endTime: "14:00" }],
        exceptions: [],
      }),
    });
    expect(invalidRes.status).toBe(400);

    const getRes = await fetch(`${BASE_URL}/api/staff/availability`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await getRes.json();
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0]).toMatchObject({ weekday: 1, part: "afternoon" });
    expect(body.exceptions).toHaveLength(1);
  });

  it("refuses a non-staff caller entirely", async () => {
    const admin = createServiceRoleClient();
    const email = `carelink-test-parent2-${Date.now()}@example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", full_name: "Test Parent", phone: randomPhone() },
    });
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    const { data: signIn } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });

    const res = await fetch(`${BASE_URL}/api/staff/profile`, {
      headers: { Authorization: `Bearer ${signIn?.session?.access_token}` },
    });
    expect(res.status).toBe(403);

    await admin.auth.admin.deleteUser(data!.user!.id);
  });
});
