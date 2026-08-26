import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 2.11-2.14: the request flow, accept/decline,
// booking lists/detail, and the care-profile-on-acceptance behaviour.
// Run against the real dev server.

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
  const { data, error } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw error ?? new Error("sign-in failed");
  return data.session.access_token;
}

async function createParentWithWard() {
  const email = `carelink-test-bkflow-parent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "Flow Test Parent", phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create parent");

  const { data: profile } = await admin
    .from("parent_profiles")
    .insert({
      user_id: data.user.id,
      area: "Tema",
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();

  const { data: ward } = await admin
    .from("wards")
    .insert({
      parent_profile_id: profile.id,
      display_name: "Ama",
      age_years: 5,
      allergies: "Peanuts",
    })
    .select()
    .single();

  return { userId: data.user.id, accessToken: await signIn(email), wardId: ward.id as string };
}

async function createStaffWithAvailability() {
  const email = `carelink-test-bkflow-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "Flow Test Staff",
      phone: randomPhone(),
      account_status: "active",
    },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create staff");

  const { data: profile } = await admin
    .from("staff_profiles")
    .insert({
      user_id: data.user.id,
      hourly_rate: 2000,
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();

  // Every weekday, 08:00-20:00 — broad enough that any Monday-Sunday
  // fixture date in these tests falls inside it.
  await admin.from("availability_windows").insert(
    Array.from({ length: 7 }, (_, weekday) => ({
      staff_profile_id: profile.id,
      weekday,
      part: "afternoon" as const,
      start_time: "08:00",
      end_time: "20:00",
    })),
  );

  return {
    userId: data.user.id,
    accessToken: await signIn(email),
    staffProfileId: profile.id as string,
  };
}

async function requestBooking(
  parentToken: string,
  staffProfileId: string,
  wardId: string,
  overrides: Partial<{ date: string; startTime: string; endTime: string; address: string }> = {},
) {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parentToken}` },
    body: JSON.stringify({
      staffProfileId,
      wardId,
      date: overrides.date ?? "2027-03-08", // a Monday
      startTime: overrides.startTime ?? "14:00",
      endTime: overrides.endTime ?? "16:00",
      address: overrides.address ?? "12 Test Street",
    }),
  });
  return { status: res.status, body: await res.json() };
}

describe("booking request, accept/decline, detail (tasks 2.11-2.14)", () => {
  let parent: { userId: string; accessToken: string; wardId: string };
  let staff: { userId: string; accessToken: string; staffProfileId: string };
  let otherParent: { userId: string; accessToken: string; wardId: string };
  let otherStaff: { userId: string; accessToken: string; staffProfileId: string };

  beforeAll(async () => {
    [parent, staff, otherParent, otherStaff] = await Promise.all([
      createParentWithWard(),
      createStaffWithAvailability(),
      createParentWithWard(),
      createStaffWithAvailability(),
    ]);
  }, 60000);

  afterAll(async () => {
    await Promise.all(
      [parent, otherParent, staff, otherStaff].map((p) => admin.auth.admin.deleteUser(p.userId)),
    );
  });

  it("refuses a request for a ward that belongs to another parent", async () => {
    const { status } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      otherParent.wardId,
    );
    expect(status).toBe(404);
  });

  it("refuses a time outside the caregiver's declared availability, with a reason", async () => {
    const { status, body } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      {
        startTime: "22:00",
        endTime: "23:00",
      },
    );
    expect(status).toBe(400);
    expect(body.reason).toBe("outside_declared_hours");
  });

  it("creates a pending booking with rate and total snapshotted", async () => {
    const { status, body } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      {
        date: "2027-03-08",
        startTime: "09:00",
        endTime: "11:00",
      },
    );
    expect(status).toBe(201);
    expect(body.booking.status).toBe("pending");
    expect(body.booking.hourly_rate).toBe(2000);
    expect(body.booking.total_amount).toBe(4000); // 2 hours at 2000/hr

    const listAsParent = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const parentList = await listAsParent.json();
    expect(parentList.bookings.some((b: { id: string }) => b.id === body.booking.id)).toBe(true);

    const listAsStaff = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const staffList = await listAsStaff.json();
    expect(staffList.bookings.some((b: { id: string }) => b.id === body.booking.id)).toBe(true);

    const listAsOtherStaff = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { Authorization: `Bearer ${otherStaff.accessToken}` },
    });
    const otherStaffList = await listAsOtherStaff.json();
    expect(otherStaffList.bookings.some((b: { id: string }) => b.id === body.booking.id)).toBe(
      false,
    );
  });

  it("hides the ward from the caregiver before acceptance, and reveals it after (task 2.14)", async () => {
    const { body: created } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      {
        date: "2027-03-08",
        startTime: "12:00",
        endTime: "13:00",
      },
    );
    const bookingId = created.booking.id as string;

    const beforeRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const before = await beforeRes.json();
    expect(before.ward).toBeNull();

    const acceptRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    expect(acceptRes.status).toBe(200);
    const accepted = await acceptRes.json();
    expect(accepted.booking.status).toBe("accepted");
    expect(accepted.booking.terms_locked_at).toBeTruthy();

    const afterRes = await fetch(`${BASE_URL}/api/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const after = await afterRes.json();
    expect(after.ward.display_name).toBe("Ama");
    expect(after.ward.allergies).toBe("Peanuts");
  });

  it("hides a booking entirely from a staff member it wasn't sent to", async () => {
    const { body: created } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      {
        date: "2027-03-15",
        startTime: "09:00",
        endTime: "10:00",
      },
    );

    // RLS blocks the row before the route's own ownership check ever
    // runs — an unrelated staff member gets "not found", not "forbidden",
    // so the booking's existence isn't revealed to them at all.
    const res = await fetch(`${BASE_URL}/api/bookings/${created.booking.id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${otherStaff.accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("declines a request with a reason", async () => {
    const { body: created } = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      {
        date: "2027-03-15",
        startTime: "11:00",
        endTime: "12:00",
      },
    );

    const res = await fetch(`${BASE_URL}/api/bookings/${created.booking.id}/decline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff.accessToken}` },
      body: JSON.stringify({ reason: "Not available after all" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.status).toBe("declined");
    expect(body.booking.decline_reason).toBe("Not available after all");
  });

  it("names the conflicting booking when accepting would overlap an already-accepted one", async () => {
    // Both requested while still pending, before either is accepted —
    // overlapping pending requests are allowed to coexist (doc 2,
    // Technical Design, §4); it's acceptance that must serialize them.
    const slot = { date: "2027-03-22", startTime: "09:00", endTime: "11:00" };
    const overlapping = { date: "2027-03-22", startTime: "10:00", endTime: "12:00" };

    const first = await requestBooking(
      parent.accessToken,
      staff.staffProfileId,
      parent.wardId,
      slot,
    );
    expect(first.status).toBe(201);
    const second = await requestBooking(
      otherParent.accessToken,
      staff.staffProfileId,
      otherParent.wardId,
      overlapping,
    );
    expect(second.status).toBe(201);

    const acceptFirst = await fetch(`${BASE_URL}/api/bookings/${first.body.booking.id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    expect(acceptFirst.status).toBe(200);

    const acceptSecond = await fetch(`${BASE_URL}/api/bookings/${second.body.booking.id}/accept`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    expect(acceptSecond.status).toBe(400);
    const body = await acceptSecond.json();
    expect(body.conflictingBooking.reference).toBe(first.body.booking.reference);
  });

  it("under concurrent acceptance, exactly one of two overlapping requests succeeds", async () => {
    const slot = { date: "2027-03-29", startTime: "09:00", endTime: "11:00" };
    const [a, b] = await Promise.all([
      requestBooking(parent.accessToken, staff.staffProfileId, parent.wardId, slot),
      requestBooking(otherParent.accessToken, staff.staffProfileId, otherParent.wardId, slot),
    ]);

    const [acceptA, acceptB] = await Promise.all([
      fetch(`${BASE_URL}/api/bookings/${a.body.booking.id}/accept`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${staff.accessToken}` },
      }),
      fetch(`${BASE_URL}/api/bookings/${b.body.booking.id}/accept`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${staff.accessToken}` },
      }),
    ]);

    const statuses = [acceptA.status, acceptB.status].sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);
  });
});
