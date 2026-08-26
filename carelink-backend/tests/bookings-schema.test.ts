import { createServiceRoleClient } from "../lib/db/supabase-server";

// Exercises the bookings schema itself (task 2.10) directly via the
// service-role client — the exclusion constraint, the transition
// trigger, the terms lock, and the automatic booking_events audit trail
// — before any endpoint is built on top of it. Same approach as the
// migration 0001 RLS test.

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function createParentWithProfile(admin: ReturnType<typeof createServiceRoleClient>) {
  const email = `carelink-test-bkparent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Test-Password-123!",
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "Booking Test Parent", phone: randomPhone() },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create parent");

  const { data: profile, error: profileErr } = await admin
    .from("parent_profiles")
    .insert({
      user_id: data.user.id,
      area: "Tema",
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();
  if (profileErr) throw profileErr;

  return { userId: data.user.id, parentProfileId: profile.id as string };
}

async function createStaffWithProfile(admin: ReturnType<typeof createServiceRoleClient>) {
  const email = `carelink-test-bkstaff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "Test-Password-123!",
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "Booking Test Staff",
      phone: randomPhone(),
      account_status: "active",
    },
  });
  if (error || !data.user) throw error ?? new Error("Failed to create staff");

  const { data: profile, error: profileErr } = await admin
    .from("staff_profiles")
    .insert({
      user_id: data.user.id,
      hourly_rate: 2000,
      emergency_contact_name: "EC",
      emergency_contact_phone: randomPhone(),
    })
    .select()
    .single();
  if (profileErr) throw profileErr;

  return { userId: data.user.id, staffProfileId: profile.id as string };
}

describe("bookings schema (task 2.10)", () => {
  const admin = createServiceRoleClient();
  let parent: { userId: string; parentProfileId: string };
  let staff: { userId: string; staffProfileId: string };

  beforeAll(async () => {
    parent = await createParentWithProfile(admin);
    staff = await createStaffWithProfile(admin);
  }, 30000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(parent.userId);
    await admin.auth.admin.deleteUser(staff.userId);
  });

  function bookingRow(overrides: Record<string, unknown> = {}) {
    return {
      reference: `CL-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      parent_profile_id: parent.parentProfileId,
      staff_profile_id: staff.staffProfileId,
      starts_at: "2027-01-04T14:00:00Z",
      ends_at: "2027-01-04T18:00:00Z",
      hourly_rate: 2000,
      total_amount: 8000,
      address: "12 Test Street",
      ...overrides,
    };
  }

  it("creates a pending booking and logs it automatically in booking_events", async () => {
    const { data: booking, error } = await admin
      .from("bookings")
      .insert(bookingRow())
      .select()
      .single();
    expect(error).toBeNull();
    expect(booking.status).toBe("pending");
    expect(Number(booking.duration_hours)).toBe(4);

    const { data: events } = await admin
      .from("booking_events")
      .select("from_status, to_status")
      .eq("booking_id", booking.id);
    expect(events).toHaveLength(1);
    expect(events![0]).toMatchObject({ from_status: null, to_status: "pending" });
  });

  it("refuses an illegal transition (pending straight to completed)", async () => {
    const { data: booking } = await admin.from("bookings").insert(bookingRow()).select().single();

    const { error } = await admin
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Illegal booking status transition/);
  });

  it("logs every legal transition and locks terms on acceptance", async () => {
    const { data: booking } = await admin.from("bookings").insert(bookingRow()).select().single();

    const { error: acceptErr } = await admin
      .from("bookings")
      .update({ status: "accepted", terms_locked_at: new Date().toISOString() })
      .eq("id", booking.id);
    expect(acceptErr).toBeNull();

    const { error: changeErr } = await admin
      .from("bookings")
      .update({ hourly_rate: 9999 })
      .eq("id", booking.id);
    expect(changeErr).not.toBeNull();
    expect(changeErr!.message).toMatch(/locked/);

    const { data: events } = await admin
      .from("booking_events")
      .select("to_status")
      .eq("booking_id", booking.id)
      .order("occurred_at");
    expect(events!.map((e) => e.to_status)).toEqual(["pending", "accepted"]);
  });

  it("refuses two accepted bookings for the same caregiver with overlapping times", async () => {
    const first = bookingRow({
      starts_at: "2027-02-01T10:00:00Z",
      ends_at: "2027-02-01T14:00:00Z",
    });
    const { data: b1 } = await admin.from("bookings").insert(first).select().single();
    await admin.from("bookings").update({ status: "accepted" }).eq("id", b1.id);

    const overlapping = bookingRow({
      starts_at: "2027-02-01T12:00:00Z",
      ends_at: "2027-02-01T16:00:00Z",
    });
    const { data: b2, error: insertErr } = await admin
      .from("bookings")
      .insert(overlapping)
      .select()
      .single();
    expect(insertErr).toBeNull(); // pending overlap is allowed

    const { error: acceptErr } = await admin
      .from("bookings")
      .update({ status: "accepted" })
      .eq("id", b2.id);
    expect(acceptErr).not.toBeNull();
  });

  it("allows overlapping pending requests but only one can ever be accepted", async () => {
    const slot = { starts_at: "2027-03-01T09:00:00Z", ends_at: "2027-03-01T11:00:00Z" };
    const { data: b1 } = await admin.from("bookings").insert(bookingRow(slot)).select().single();
    const { data: b2 } = await admin.from("bookings").insert(bookingRow(slot)).select().single();

    const { error: firstAccept } = await admin
      .from("bookings")
      .update({ status: "accepted" })
      .eq("id", b1.id);
    expect(firstAccept).toBeNull();

    const { error: secondAccept } = await admin
      .from("bookings")
      .update({ status: "accepted" })
      .eq("id", b2.id);
    expect(secondAccept).not.toBeNull();
  });
});
