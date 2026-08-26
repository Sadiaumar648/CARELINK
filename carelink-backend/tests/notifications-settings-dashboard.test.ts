import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 4.10-4.13.

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

async function createAdmin() {
  const email = `carelink-test-nsd-admin-${Date.now()}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: "NSD Test Admin", phone: randomPhone() },
  });
  return { userId: data!.user!.id, accessToken: await signIn(email) };
}

async function createVerifiedParentWithWard() {
  const email = `carelink-test-nsd-parent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "NSD Test Parent", phone: randomPhone() },
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
    .insert({ parent_profile_id: profile.id, display_name: "Yaw", age_years: 7 })
    .select()
    .single();
  return { userId: data!.user!.id, accessToken: await signIn(email), wardId: ward.id as string };
}

async function createVerifiedStaff() {
  const email = `carelink-test-nsd-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "NSD Test Staff",
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

describe("notifications, settings, admin dashboards (tasks 4.10-4.13)", () => {
  let adminSession: { userId: string; accessToken: string };
  let parent: { userId: string; accessToken: string; wardId: string };
  let staff: { userId: string; accessToken: string; staffProfileId: string };

  beforeAll(async () => {
    [adminSession, parent, staff] = await Promise.all([
      createAdmin(),
      createVerifiedParentWithWard(),
      createVerifiedStaff(),
    ]);
  }, 90000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(adminSession.userId);
    await admin.auth.admin.deleteUser(parent.userId);
    await admin.auth.admin.deleteUser(staff.userId);
  });

  it("notifies the caregiver on request and the parent on accept, unread then markable read", async () => {
    const reqRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({
        staffProfileId: staff.staffProfileId,
        wardId: parent.wardId,
        date: "2027-06-01",
        startTime: "09:00",
        endTime: "10:00",
        address: "1 Test Ave",
      }),
    });
    const booking = (await reqRes.json()).booking;

    const staffNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const staffBody = await staffNotifs.json();
    expect(staffBody.unreadCount).toBeGreaterThanOrEqual(1);
    const requestNotif = staffBody.notifications.find(
      (n: { kind: string }) => n.kind === "booking_request",
    );
    expect(requestNotif).toBeTruthy();

    await fetch(`${BASE_URL}/api/bookings/${booking.id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });

    const parentNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const parentBody = await parentNotifs.json();
    const acceptedNotif = parentBody.notifications.find(
      (n: { kind: string }) => n.kind === "booking_accepted",
    );
    expect(acceptedNotif).toBeTruthy();

    const markRes = await fetch(`${BASE_URL}/api/notifications/${acceptedNotif.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect(markRes.status).toBe(200);
    expect((await markRes.json()).notification.read_at).toBeTruthy();
  }, 90000);

  it("refuses a weight set that doesn't sum to 1, accepts a valid one", async () => {
    const badRes = await fetch(`${BASE_URL}/api/admin/settings/weights`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({
        availability: 0.5,
        area: 0.5,
        skills: 0.5,
        ratingExperience: 0.5,
        budget: 0.5,
      }),
    });
    expect(badRes.status).toBe(400);

    const goodRes = await fetch(`${BASE_URL}/api/admin/settings/weights`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({
        availability: 0.4,
        area: 0.2,
        skills: 0.2,
        ratingExperience: 0.1,
        budget: 0.1,
      }),
    });
    expect(goodRes.status).toBe(200);

    const getRes = await fetch(`${BASE_URL}/api/admin/settings/weights`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const weights = (await getRes.json()).weights;
    const availability = weights.find((w: { factor: string }) => w.factor === "availability");
    expect(Number(availability.weight)).toBeCloseTo(0.4);

    // restore defaults so other suites' score-breakdown assumptions hold
    await fetch(`${BASE_URL}/api/admin/settings/weights`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({
        availability: 0.3,
        area: 0.25,
        skills: 0.2,
        ratingExperience: 0.15,
        budget: 0.1,
      }),
    });
  });

  it("a non-admin cannot edit settings", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/settings/weights`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({
        availability: 0.3,
        area: 0.25,
        skills: 0.2,
        ratingExperience: 0.15,
        budget: 0.1,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("reads and updates a platform setting (commission rate)", async () => {
    const getRes = await fetch(`${BASE_URL}/api/admin/settings/commission_rate`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(getRes.status).toBe(200);

    const patchRes = await fetch(`${BASE_URL}/api/admin/settings/commission_rate`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({ value: 0.12 }),
    });
    expect(patchRes.status).toBe(200);
    expect(Number((await patchRes.json()).setting.value)).toBeCloseTo(0.12);

    // restore
    await fetch(`${BASE_URL}/api/admin/settings/commission_rate`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.accessToken}`,
      },
      body: JSON.stringify({ value: 0.15 }),
    });
  });

  it("the admin overview reports figures with no hand-entered values", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings.total).toBeGreaterThanOrEqual(0);
    expect(typeof body.activeStaffCount).toBe("number");
    expect(typeof body.openReports).toBe("number");
  });

  it("the roster lists the caregiver with profile-completeness and verification state", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/roster`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const body = await res.json();
    const entry = body.roster.find((r: { id: string }) => r.id === staff.userId);
    expect(entry.profileComplete).toBe(true);
    expect(entry.verificationStatus).toBe("verified");
  });

  it("the admin bookings table is filterable by status", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/bookings?status=accepted`, {
      headers: { Authorization: `Bearer ${adminSession.accessToken}` },
    });
    const body = await res.json();
    expect(body.bookings.every((b: { status: string }) => b.status === "accepted")).toBe(true);
  });
});
