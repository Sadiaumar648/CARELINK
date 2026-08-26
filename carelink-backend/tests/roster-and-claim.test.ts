import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 1.8 and 1.9, run against the real dev server
// so the actual route handlers — not just the underlying Supabase calls —
// are what's under test. Start `npm run dev --workspace carelink-backend`
// before running this file.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createAdminSession() {
  const admin = createServiceRoleClient();
  const email = `carelink-test-admin-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: "Test Admin", phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create admin");

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) throw signInErr ?? new Error("Failed to sign in admin");

  return { id: data.user.id, accessToken: signIn.session.access_token };
}

describe("roster and invitation claim (tasks 1.8, 1.9)", () => {
  let adminId: string;
  let staffUserId: string | undefined;

  beforeAll(async () => {
    const admin = await createAdminSession();
    adminId = admin.id;
    (global as unknown as { __adminToken: string }).__adminToken = admin.accessToken;
  }, 30000);

  afterAll(async () => {
    const admin = createServiceRoleClient();
    await admin.auth.admin.deleteUser(adminId);
    if (staffUserId) {
      await admin.auth.admin.deleteUser(staffUserId);
    }
  });

  it("refuses to create a roster record for a non-admin caller", async () => {
    const svc = createServiceRoleClient();
    const email = `carelink-test-parent-${Date.now()}@example.com`;
    const { data } = await svc.auth.admin.createUser({
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

    const res = await fetch(`${BASE_URL}/api/admin/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signIn?.session?.access_token}`,
      },
      body: JSON.stringify({ fullName: "Should Not Work", phone: randomPhone() }),
    });

    expect(res.status).toBe(403);
    await svc.auth.admin.deleteUser(data!.user!.id);
  });

  it("lets an admin add a caregiver, and the caregiver claims it with the right code", async () => {
    const adminToken = (global as unknown as { __adminToken: string }).__adminToken;
    const staffPhone = randomPhone();

    const createRes = await fetch(`${BASE_URL}/api/admin/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fullName: "Akosua Test", phone: staffPhone }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    staffUserId = created.id;
    expect(created.invitationCode).toMatch(/^[A-Z0-9]{8}$/);

    // Wrong code is refused
    const wrongRes = await fetch(`${BASE_URL}/api/auth/claim-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "WRONGCOD", phone: staffPhone, password: TEST_PASSWORD }),
    });
    expect(wrongRes.status).toBe(400);

    // Correct code activates the same record
    const claimRes = await fetch(`${BASE_URL}/api/auth/claim-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: created.invitationCode, phone: staffPhone, password: TEST_PASSWORD }),
    });
    expect(claimRes.status).toBe(200);
    const claimed = await claimRes.json();
    expect(claimed.accessToken).toBeTruthy();

    const meRes = await fetch(`${BASE_URL}/api/me`, {
      headers: { Authorization: `Bearer ${claimed.accessToken}` },
    });
    const me = await meRes.json();
    expect(me.id).toBe(staffUserId);
    expect(me.role).toBe("staff");

    // A claimed code cannot be reused
    const reuseRes = await fetch(`${BASE_URL}/api/auth/claim-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: created.invitationCode, phone: staffPhone, password: TEST_PASSWORD }),
    });
    expect(reuseRes.status).toBe(400);
  });
});
