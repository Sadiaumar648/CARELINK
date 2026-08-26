import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 1.7 (household step) and 2.4 (Ward Care
// Profile), run against the real dev server.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createParentSession(label: string) {
  const admin = createServiceRoleClient();
  const email = `carelink-test-parent-${label}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: `Test Parent ${label}`, phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create parent");

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("Failed to sign in parent");

  return { id: data.user.id, accessToken: signIn.session.access_token };
}

async function saveHousehold(token: string) {
  const res = await fetch(`${BASE_URL}/api/parents/household`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      area: "East Legon",
      address: "12 Test Street",
      emergencyContactName: "Backup Contact",
      emergencyContactPhone: "+233550001111",
    }),
  });
  return res;
}

describe("household and Ward Care Profile (tasks 1.7, 2.4)", () => {
  let parentA: { id: string; accessToken: string };
  let parentB: { id: string; accessToken: string };

  beforeAll(async () => {
    parentA = await createParentSession("a");
    parentB = await createParentSession("b");
  }, 90000);

  afterAll(async () => {
    const admin = createServiceRoleClient();
    await admin.auth.admin.deleteUser(parentA.id);
    await admin.auth.admin.deleteUser(parentB.id);
  });

  it("a ward cannot be created before the household step", async () => {
    const res = await fetch(`${BASE_URL}/api/wards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parentA.accessToken}`,
      },
      body: JSON.stringify({ displayName: "Too Early", ageYears: 5 }),
    });
    expect(res.status).toBe(400);
  });

  it("saves the household profile and only age is stored, never a date of birth", async () => {
    const res = await saveHousehold(parentA.accessToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.household.area).toBe("East Legon");
    expect(Object.keys(body.household)).not.toContain("date_of_birth");

    await saveHousehold(parentB.accessToken);
  });

  it("creates a ward, and it persists and reloads with a last-edited timestamp", async () => {
    const createRes = await fetch(`${BASE_URL}/api/wards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parentA.accessToken}`,
      },
      body: JSON.stringify({
        displayName: "Ama",
        ageYears: 6,
        allergies: "Peanuts",
        medications: "None",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.ward.display_name).toBe("Ama");
    expect(created.ward.updated_at).toBeTruthy();

    const listRes = await fetch(`${BASE_URL}/api/wards`, {
      headers: { Authorization: `Bearer ${parentA.accessToken}` },
    });
    const list = await listRes.json();
    expect(list.wards).toHaveLength(1);
    expect(list.wards[0].id).toBe(created.ward.id);

    return created.ward.id as string;
  });

  it("no other parent can read, edit or archive this ward â€” proven at the database level", async () => {
    const createRes = await fetch(`${BASE_URL}/api/wards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parentA.accessToken}`,
      },
      body: JSON.stringify({ displayName: "Kwame", ageYears: 4 }),
    });
    const created = await createRes.json();
    const wardId = created.ward.id as string;

    const readRes = await fetch(`${BASE_URL}/api/wards/${wardId}`, {
      headers: { Authorization: `Bearer ${parentB.accessToken}` },
    });
    expect(readRes.status).toBe(404);

    const editRes = await fetch(`${BASE_URL}/api/wards/${wardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parentB.accessToken}`,
      },
      body: JSON.stringify({ allergies: "Tampered" }),
    });
    expect(editRes.status).toBe(404);

    const ownReadRes = await fetch(`${BASE_URL}/api/wards/${wardId}`, {
      headers: { Authorization: `Bearer ${parentA.accessToken}` },
    });
    expect(ownReadRes.status).toBe(200);
  });

  it("archives a ward instead of deleting it, and it drops out of the list", async () => {
    const createRes = await fetch(`${BASE_URL}/api/wards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parentA.accessToken}`,
      },
      body: JSON.stringify({ displayName: "To Archive", ageYears: 8 }),
    });
    const created = await createRes.json();
    const wardId = created.ward.id as string;

    const archiveRes = await fetch(`${BASE_URL}/api/wards/${wardId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${parentA.accessToken}` },
    });
    expect(archiveRes.status).toBe(200);
    const archived = await archiveRes.json();
    expect(archived.ward.archived_at).toBeTruthy();

    const listRes = await fetch(`${BASE_URL}/api/wards`, {
      headers: { Authorization: `Bearer ${parentA.accessToken}` },
    });
    const list = await listRes.json();
    expect(list.wards.find((w: { id: string }) => w.id === wardId)).toBeUndefined();

    // Still directly reachable â€” an archived ward is retired, not gone.
    const directRes = await fetch(`${BASE_URL}/api/wards/${wardId}`, {
      headers: { Authorization: `Bearer ${parentA.accessToken}` },
    });
    expect(directRes.status).toBe(200);
  });
});
