import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 3.2, 3.3 (parent side), 3.4, 3.5.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

const admin = createServiceRoleClient();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createUser(role: "parent" | "staff", label: string) {
  const email = `carelink-test-verify-${label}-${Date.now()}@example.com`;
  const extra = role === "staff" ? { account_status: "active" } : {};
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Verify Test ${label}`, phone: randomPhone(), ...extra },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create user");
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return { userId: data.user.id, accessToken: signIn!.session!.access_token };
}

async function submitVerification(token: string, overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("idDocumentType", overrides.idDocumentType ?? "ghana_card");
  form.set("idDocumentNumber", overrides.idDocumentNumber ?? "GHA-123456789-0");
  form.set("referenceName", overrides.referenceName ?? "A Reference");
  form.set("referencePhone", overrides.referencePhone ?? randomPhone());
  form.set("consentPhoto", overrides.consentPhoto ?? "true");
  form.set(
    "idDocumentFile",
    new Blob([Buffer.from("fake-id-bytes")], { type: "image/jpeg" }),
    "id.jpg",
  );
  form.set(
    "selfieFile",
    new Blob([Buffer.from("fake-selfie-bytes")], { type: "image/jpeg" }),
    "selfie.jpg",
  );

  const res = await fetch(`${BASE_URL}/api/verification/submissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

describe("verification workflow (tasks 3.2, 3.4, 3.5)", () => {
  let parent: { userId: string; accessToken: string };
  let adminSession: { userId: string; accessToken: string };

  beforeAll(async () => {
    [parent, adminSession] = await Promise.all([
      createUser("parent", "parent"),
      (async () => {
        const email = `carelink-test-verify-admin-${Date.now()}@example.com`;
        const { data } = await admin.auth.admin.createUser({
          email,
          password: TEST_PASSWORD,
          email_confirm: true,
          user_metadata: { role: "admin", full_name: "Verify Test Admin", phone: randomPhone() },
        });
        const { data: signIn } = await anon.auth.signInWithPassword({
          email,
          password: TEST_PASSWORD,
        });
        return { userId: data!.user!.id, accessToken: signIn!.session!.access_token };
      })(),
    ]);
  }, 90000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(parent.userId);
    await admin.auth.admin.deleteUser(adminSession.userId);
  });

  it("moves the account to pending on submission, uploads both files, and refuses without an ID photo", async () => {
    const noFileRes = await fetch(`${BASE_URL}/api/verification/submissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${parent.accessToken}` },
      body: (() => {
        const f = new FormData();
        f.set("idDocumentType", "ghana_card");
        f.set("idDocumentNumber", "X");
        f.set("referenceName", "A Reference");
        f.set("referencePhone", randomPhone());
        return f;
      })(),
    });
    expect(noFileRes.status).toBe(400);

    const { status, body } = await submitVerification(parent.accessToken);
    expect(status).toBe(201);
    expect(body.submission.status).toBe("pending");
    expect(body.submission.selfie_path).toBeTruthy();

    const { data: userRow } = await admin
      .from("users")
      .select("verification_status")
      .eq("id", parent.userId)
      .single();
    expect(userRow!.verification_status).toBe("pending");
  });

  it("lists the submission in the admin queue with signed image URLs, oldest first", async () => {
    const listRes = await fetch(`${BASE_URL}/api/admin/verifications?status=pending`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const list = await listRes.json();
    const mine = list.submissions.find((s: { user_id: string }) => s.user_id === parent.userId);
    expect(mine).toBeTruthy();

    const detailRes = await fetch(`${BASE_URL}/api/admin/verifications/${mine.id}`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const detail = await detailRes.json();
    expect(detail.idDocumentUrl).toMatch(/^https?:\/\//);
    expect(detail.selfieUrl).toMatch(/^https?:\/\//);
  });

  it("a non-admin cannot reach the review queue", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/verifications`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("requires a rejection reason", async () => {
    const listRes = await fetch(`${BASE_URL}/api/admin/verifications?status=pending`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const list = await listRes.json();
    const mine = list.submissions.find((s: { user_id: string }) => s.user_id === parent.userId);

    const res = await fetch(`${BASE_URL}/api/admin/verifications/${mine.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejecting syncs users.verification_status, and the user can resubmit, keeping history", async () => {
    const listRes = await fetch(`${BASE_URL}/api/admin/verifications?status=pending`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const list = await listRes.json();
    const mine = list.submissions.find((s: { user_id: string }) => s.user_id === parent.userId);

    const rejectRes = await fetch(`${BASE_URL}/api/admin/verifications/${mine.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({ decision: "rejected", rejectionReason: "Blurry photo" }),
    });
    expect(rejectRes.status).toBe(200);

    const { data: userRow } = await admin
      .from("users")
      .select("verification_status")
      .eq("id", parent.userId)
      .single();
    expect(userRow!.verification_status).toBe("rejected");

    const resubmit = await submitVerification(parent.accessToken, {
      idDocumentNumber: "GHA-999999999-0",
    });
    expect(resubmit.status).toBe(201);

    const ownList = await fetch(`${BASE_URL}/api/verification/submissions`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const own = await ownList.json();
    expect(own.submissions).toHaveLength(2);
    expect(own.submissions.map((s: { status: string }) => s.status).sort()).toEqual([
      "pending",
      "rejected",
    ]);
  });

  it("approving moves the account to verified", async () => {
    const listRes = await fetch(`${BASE_URL}/api/admin/verifications?status=pending`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const list = await listRes.json();
    const mine = list.submissions.find((s: { user_id: string }) => s.user_id === parent.userId);

    const approveRes = await fetch(`${BASE_URL}/api/admin/verifications/${mine.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({ decision: "verified" }),
    });
    expect(approveRes.status).toBe(200);

    const { data: userRow } = await admin
      .from("users")
      .select("verification_status")
      .eq("id", parent.userId)
      .single();
    expect(userRow!.verification_status).toBe("verified");
  });
});
