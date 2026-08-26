import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for the retention routine (task 5.x): verification
// photos are deleted from storage once images_purge_after has passed,
// while the submission row, decision and verdict are kept for audit.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

const admin = createServiceRoleClient();

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createDecidedSubmission(purgeAfter: Date) {
  const email = `carelink-test-retention-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "Retention Test", phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create user");
  const userId = data.user.id;

  const idPath = `${userId}/id-retention-test.jpg`;
  const selfiePath = `${userId}/selfie-retention-test.jpg`;
  await admin.storage
    .from("identity-documents")
    .upload(idPath, Buffer.from("fake-id-bytes"), { contentType: "image/jpeg" });
  await admin.storage
    .from("identity-documents")
    .upload(selfiePath, Buffer.from("fake-selfie-bytes"), { contentType: "image/jpeg" });

  const { data: submission, error: insertErr } = await admin
    .from("verification_submissions")
    .insert({
      user_id: userId,
      id_document_type: "ghana_card",
      id_document_number: "GHA-RETENTION-0",
      id_document_path: idPath,
      selfie_path: selfiePath,
      reference_name: "A Reference",
      reference_phone: randomPhone(),
      status: "rejected",
      rejection_reason: "test fixture",
      reviewed_at: new Date().toISOString(),
      images_purge_after: purgeAfter.toISOString(),
    })
    .select()
    .single();
  if (insertErr) throw insertErr;

  return { userId, submissionId: submission.id as string, idPath, selfiePath };
}

describe("retention routine", () => {
  const created: string[] = [];

  afterAll(async () => {
    await Promise.all(created.map((userId) => admin.auth.admin.deleteUser(userId)));
  });

  it("refuses a call without the correct cron secret", async () => {
    const res = await fetch(`${BASE_URL}/api/internal/retention`, {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("purges photos past their purge-after date but leaves recent ones alone", async () => {
    const overdue = await createDecidedSubmission(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const notYet = await createDecidedSubmission(new Date(Date.now() + 24 * 60 * 60 * 1000));
    created.push(overdue.userId, notYet.userId);

    const res = await fetch(`${BASE_URL}/api/internal/retention`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.purged).toBeGreaterThanOrEqual(1);

    const { data: overdueRow } = await admin
      .from("verification_submissions")
      .select("id_document_path, selfie_path, status, rejection_reason")
      .eq("id", overdue.submissionId)
      .single();
    expect(overdueRow!.id_document_path).toBeNull();
    expect(overdueRow!.selfie_path).toBeNull();
    // The decision itself is untouched — only the photos are gone.
    expect(overdueRow!.status).toBe("rejected");
    expect(overdueRow!.rejection_reason).toBe("test fixture");

    const { data: listing } = await admin.storage.from("identity-documents").list(overdue.userId);
    expect(listing).toHaveLength(0);

    const { data: notYetRow } = await admin
      .from("verification_submissions")
      .select("id_document_path, selfie_path")
      .eq("id", notYet.submissionId)
      .single();
    expect(notYetRow!.id_document_path).toBe(notYet.idPath);
    expect(notYetRow!.selfie_path).toBe(notYet.selfiePath);
  });
});
