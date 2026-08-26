import { createClient } from "@supabase/supabase-js";
import { createRequestScopedClient, createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for task 1.4's acceptance criterion: "a negative test
// proves a user cannot read another user's row." Runs against the real
// Supabase project (there is no local stack in this setup), creating and
// deleting two throwaway accounts per run.

const TEST_PASSWORD = "Test-Password-123!";

function randomEmail(label: string) {
  return `carelink-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function createTestUser(label: string) {
  const admin = createServiceRoleClient();
  const email = randomEmail(label);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "parent",
      full_name: `Test ${label}`,
      phone: `+23355${Math.floor(1000000 + Math.random() * 8999999)}`,
    },
  });
  if (error || !data.user) {
    throw error ?? new Error("Failed to create test user");
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw signInErr ?? new Error("Failed to sign in test user");
  }

  return { id: data.user.id, accessToken: signIn.session.access_token };
}

async function deleteTestUser(id: string) {
  const admin = createServiceRoleClient();
  await admin.auth.admin.deleteUser(id);
}

describe("users row-level security (task 1.4)", () => {
  let userA: { id: string; accessToken: string };
  let userB: { id: string; accessToken: string };

  beforeAll(async () => {
    userA = await createTestUser("a");
    userB = await createTestUser("b");
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
  });

  it("lets a user read their own row", async () => {
    const client = createRequestScopedClient(userA.accessToken);
    const { data, error } = await client
      .from("users")
      .select("id, role")
      .eq("id", userA.id)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(userA.id);
  });

  it("refuses to return another user's row", async () => {
    const client = createRequestScopedClient(userA.accessToken);
    const { data, error } = await client
      .from("users")
      .select("id, role")
      .eq("id", userB.id)
      .maybeSingle();

    // RLS filters the row out rather than erroring — the query succeeds
    // but returns nothing. That's the actual guarantee: a route handler
    // that forgets to check ownership still can't see another user's row,
    // because the database never hands it over in the first place.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("refuses to change its own role, even on its own row", async () => {
    const client = createRequestScopedClient(userA.accessToken);
    const { error } = await client.from("users").update({ role: "admin" }).eq("id", userA.id);

    expect(error).not.toBeNull();
  });
});
