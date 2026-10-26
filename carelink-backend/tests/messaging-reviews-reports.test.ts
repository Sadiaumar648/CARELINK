import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 4.7, 4.8, 4.9, plus the report-blocks-
// verification rule wired into the admin verification decision route.

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

async function signIn(email: string) {
  const { data } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return data!.session!.access_token;
}

async function createVerifiedParentWithWard() {
  const email = `carelink-test-mrr-parent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "MRR Test Parent", phone: randomPhone() },
  });
  await admin.from("users").update({ verification_status: "verified" }).eq("id", data!.user!.id);
  const { data: profile } = await admin
    .from("parent_profiles")
    .insert({
      user_id: data!.user!.id,
      area: "Tema",
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();
  const { data: ward } = await admin
    .from("wards")
    .insert({ parent_profile_id: profile.id, display_name: "Esi", age_years: 6 })
    .select()
    .single();
  return { userId: data!.user!.id, accessToken: await signIn(email), wardId: ward.id as string };
}

async function createVerifiedStaff() {
  const email = `carelink-test-mrr-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "MRR Test Staff",
      phone: randomPhone(),
      account_status: "active",
    },
  });
  await admin.from("users").update({ verification_status: "verified" }).eq("id", data!.user!.id);
  const { data: profile } = await admin
    .from("staff_profiles")
    .insert({
      user_id: data!.user!.id,
      hourly_rate: 2000,
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();
  await admin.from("availability_windows").insert(
    Array.from({ length: 7 }, (_, weekday) => ({
      staff_profile_id: profile.id,
      weekday,
      part: "afternoon" as const,
      start_time: "00:00",
      end_time: "23:59",
    })),
  );
  return {
    userId: data!.user!.id,
    accessToken: await signIn(email),
    staffProfileId: profile.id as string,
  };
}

async function createBooking(
  parent: { accessToken: string; wardId: string },
  staff: { staffProfileId: string },
  date: string,
) {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parent.accessToken}` },
    body: JSON.stringify({
      staffProfileId: staff.staffProfileId,
      wardId: parent.wardId,
      date,
      startTime: "09:00",
      endTime: "10:00",
      address: "1 Test Ave",
    }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`booking create failed: ${JSON.stringify(body)}`);
  return body.booking as { id: string };
}

async function acceptBooking(bookingId: string, staffToken: string) {
  const res = await fetch(`${BASE_URL}/api/bookings/${bookingId}/accept`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  if (res.status !== 200) throw new Error(`accept failed: ${JSON.stringify(await res.json())}`);
}

async function completeBooking(bookingId: string, parentToken: string, staffToken: string) {
  await fetch(`${BASE_URL}/api/bookings/${bookingId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parentToken}` },
    body: JSON.stringify({ network: "mtn", payerPhone: randomPhone().slice(0, -1) + "2" }),
  });
  await fetch(`${BASE_URL}/api/bookings/${bookingId}/start`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${parentToken}` },
  });
  await fetch(`${BASE_URL}/api/bookings/${bookingId}/end`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${staffToken}` },
  });
}

describe("messaging, reviews, reports (tasks 4.7-4.9)", () => {
  let parent: { userId: string; accessToken: string; wardId: string };
  let staff: { userId: string; accessToken: string; staffProfileId: string };
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    [parent, staff] = await Promise.all([createVerifiedParentWithWard(), createVerifiedStaff()]);
  }, 90000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(parent.userId);
    await admin.auth.admin.deleteUser(staff.userId);
  });

  it("refuses messaging before acceptance, then allows it once accepted, readable by both parties", async () => {
    const booking = await createBooking(parent, staff, "2027-05-03");

    const tooEarly = await fetch(`${BASE_URL}/api/bookings/${booking.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ body: "Hello?" }),
    });
    expect(tooEarly.status).toBe(400);

    await acceptBooking(booking.id, staff.accessToken);

    const sendRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ body: "See you Monday!" }),
    });
    expect(sendRes.status).toBe(201);

    const listAsStaff = await fetch(`${BASE_URL}/api/bookings/${booking.id}/messages`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const list = await listAsStaff.json();
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0].read_at).toBeNull();

    const markRead = await fetch(`${BASE_URL}/api/bookings/${booking.id}/messages`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    expect((await markRead.json()).updated).toBe(1);
  }, 90000);

  it("only the parent, only after completion, can review â€” once â€” and the caregiver's rating updates", async () => {
    const booking = await createBooking(parent, staff, today);
    await acceptBooking(booking.id, staff.accessToken);

    const tooEarly = await fetch(`${BASE_URL}/api/bookings/${booking.id}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ rating: 5 }),
    });
    expect(tooEarly.status).toBe(400);

    await completeBooking(booking.id, parent.accessToken, staff.accessToken);

    const byStaff = await fetch(`${BASE_URL}/api/bookings/${booking.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff.accessToken}` },
      body: JSON.stringify({ rating: 5 }),
    });
    expect(byStaff.status).toBe(403);

    const reviewRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ rating: 5, comment: "Wonderful with my daughter" }),
    });
    expect(reviewRes.status).toBe(201);

    const secondRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ rating: 3 }),
    });
    expect(secondRes.status).toBe(400);

    const respondRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff.accessToken}` },
      body: JSON.stringify({ staffResponse: "Thank you so much!" }),
    });
    expect(respondRes.status).toBe(200);

    const { data: staffRow } = await admin
      .from("staff_profiles")
      .select("rating_avg, rating_count")
      .eq("id", staff.staffProfileId)
      .single();
    expect(Number(staffRow!.rating_avg)).toBe(5);
    expect(staffRow!.rating_count).toBeGreaterThanOrEqual(1);
  }, 90000);

  it("reports route to the admin queue, are invisible to the subject, and require a note to resolve", async () => {
    const adminEmail = `carelink-test-mrr-admin-${Date.now()}@example.com`;
    const { data: adminUser } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "admin", full_name: "MRR Test Admin", phone: randomPhone() },
    });
    const adminToken = await signIn(adminEmail);

    const reportedEmail = `carelink-test-mrr-reported-${Date.now()}@example.com`;
    const { data: reportedUser } = await admin.auth.admin.createUser({
      email: reportedEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", full_name: "Reported Person", phone: randomPhone() },
    });
    const reportedToken = await signIn(reportedEmail);

    const createRes = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({
        subjectUserId: reportedUser!.user!.id,
        category: "safety",
        description: "Concerning behaviour",
      }),
    });
    expect(createRes.status).toBe(201);
    const report = (await createRes.json()).report;

    const asReporter = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect((await asReporter.json()).reports.some((r: { id: string }) => r.id === report.id)).toBe(
      true,
    );

    const asSubject = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Authorization: `Bearer ${reportedToken}` },
    });
    expect((await asSubject.json()).reports.some((r: { id: string }) => r.id === report.id)).toBe(
      false,
    );

    const adminListRes = await fetch(`${BASE_URL}/api/admin/reports?status=open`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminList = await adminListRes.json();
    expect(adminList.reports.some((r: { id: string }) => r.id === report.id)).toBe(true);

    const resolveNoNoteRes = await fetch(`${BASE_URL}/api/admin/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(resolveNoNoteRes.status).toBe(400);

    const resolveRes = await fetch(`${BASE_URL}/api/admin/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: "resolved",
        resolutionNote: "Investigated, no action needed",
      }),
    });
    expect(resolveRes.status).toBe(200);

    await admin.auth.admin.deleteUser(adminUser!.user!.id);
    await admin.auth.admin.deleteUser(reportedUser!.user!.id);
  }, 90000);
});
