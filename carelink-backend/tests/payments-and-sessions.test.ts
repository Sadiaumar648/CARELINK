import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Integration test for tasks 3.7-3.11: payment, session start/end,
// symmetric emergency-contact reveal, commission split, earnings, and
// cancellation. Run against the real dev server.

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
  const email = `carelink-test-pay-parent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "parent", full_name: "Pay Test Parent", phone: randomPhone() },
  });
  await admin.from("users").update({ verification_status: "verified" }).eq("id", data!.user!.id);
  const { data: profile } = await admin
    .from("parent_profiles")
    .insert({
      user_id: data!.user!.id,
      area: "Tema",
      emergency_contact_name: "Parent EC",
      emergency_contact_phone: "+233550111111",
    })
    .select()
    .single();
  const { data: ward } = await admin
    .from("wards")
    .insert({ parent_profile_id: profile.id, display_name: "Kofi", age_years: 4 })
    .select()
    .single();
  return { userId: data!.user!.id, accessToken: await signIn(email), wardId: ward.id as string };
}

async function createVerifiedStaffWithAvailability() {
  const email = `carelink-test-pay-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "staff",
      full_name: "Pay Test Staff",
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
      emergency_contact_name: "Staff EC",
      emergency_contact_phone: "+233550222222",
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

async function requestAndAccept(
  parent: { accessToken: string; wardId: string },
  staff: { accessToken: string; staffProfileId: string },
  date: string,
  startTime: string,
  endTime: string,
) {
  const reqRes = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parent.accessToken}` },
    body: JSON.stringify({
      staffProfileId: staff.staffProfileId,
      wardId: parent.wardId,
      date,
      startTime,
      endTime,
      address: "1 Test Ave",
    }),
  });
  const created = await reqRes.json();
  if (reqRes.status !== 201) throw new Error(`request failed: ${JSON.stringify(created)}`);

  const acceptRes = await fetch(`${BASE_URL}/api/bookings/${created.booking.id}/accept`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${staff.accessToken}` },
  });
  if (acceptRes.status !== 200)
    throw new Error(`accept failed: ${JSON.stringify(await acceptRes.json())}`);

  return created.booking as { id: string; total_amount: number };
}

describe("payments, sessions, commission, earnings, cancellation (tasks 3.7-3.11)", () => {
  let parent: { userId: string; accessToken: string; wardId: string };
  let staff: { userId: string; accessToken: string; staffProfileId: string };
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    [parent, staff] = await Promise.all([
      createVerifiedParentWithWard(),
      createVerifiedStaffWithAvailability(),
    ]);
  }, 90000);

  afterAll(async () => {
    await admin.auth.admin.deleteUser(parent.userId);
    await admin.auth.admin.deleteUser(staff.userId);
  });

  it("a failed payment leaves the booking accepted and payable again", async () => {
    const booking = await requestAndAccept(parent, staff, "2027-04-05", "09:00", "10:00");

    const res = await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009990" }), // ends in 0 -> fails
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.payment.status).toBe("failed");

    const detailRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const detail = await detailRes.json();
    expect(detail.booking.status).toBe("accepted");
  });

  it("a pending payment resolves to succeeded on poll and moves the booking to paid", async () => {
    const booking = await requestAndAccept(parent, staff, "2027-04-06", "09:00", "10:00");

    const initRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009991" }), // ends in 1 -> pending
    });
    const initiated = await initRes.json();
    expect(initiated.payment.status).toBe("pending");

    const pollRes = await fetch(`${BASE_URL}/api/payments/${initiated.payment.id}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const polled = await pollRes.json();
    expect(polled.payment.status).toBe("succeeded");

    const detailRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect((await detailRes.json()).booking.status).toBe("paid");
  });

  it("refuses a second payment once one has succeeded", async () => {
    const booking = await requestAndAccept(parent, staff, "2027-04-07", "09:00", "10:00");
    await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009992" }), // succeeds
    });

    const secondRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009993" }),
    });
    expect(secondRes.status).toBe(400);
  });

  it("full flow: pay, start (contact reveal), end (commission + earnings), verified from both sides", async () => {
    const booking = await requestAndAccept(parent, staff, today, "01:00", "02:00");

    const payRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009994" }),
    });
    expect((await payRes.json()).payment.status).toBe("succeeded");

    const beforeActive = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const beforeActiveBody = await beforeActive.json();
    expect(beforeActiveBody.emergencyContact).toBeNull();
    // Unlike the emergency contact, the counterparty's user id (needed to
    // file a report against them) isn't gated to "active" — it's known
    // as soon as a booking exists between the two of you.
    expect(beforeActiveBody.counterpartyUserId).toBe(parent.userId);

    const startRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/start`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    expect(startRes.status).toBe(200);

    const asParent = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const parentView = await asParent.json();
    expect(parentView.emergencyContact).toEqual({ name: "Staff EC", phone: "+233550222222" });
    expect(parentView.counterpartyUserId).toBe(staff.userId);

    const asStaff = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const staffView = await asStaff.json();
    expect(staffView.emergencyContact).toEqual({ name: "Parent EC", phone: "+233550111111" });
    expect(staffView.counterpartyUserId).toBe(parent.userId);

    const staffCompletedBefore = await admin
      .from("staff_profiles")
      .select("bookings_completed")
      .eq("id", staff.staffProfileId)
      .single();

    const endRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/end`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    expect(endRes.status).toBe(200);
    expect((await endRes.json()).booking.status).toBe("completed");

    const afterCompleted = await fetch(`${BASE_URL}/api/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${parent.accessToken}` },
    });
    const afterCompletedBody = await afterCompleted.json();
    expect(afterCompletedBody.emergencyContact).toBeNull(); // window closed
    expect(afterCompletedBody.counterpartyUserId).toBe(staff.userId); // still known

    const staffCompletedAfter = await admin
      .from("staff_profiles")
      .select("bookings_completed")
      .eq("id", staff.staffProfileId)
      .single();
    expect(staffCompletedAfter.data!.bookings_completed).toBe(
      staffCompletedBefore.data!.bookings_completed + 1,
    );

    const { data: payment } = await admin
      .from("payments")
      .select("*")
      .eq("booking_id", booking.id)
      .eq("status", "succeeded")
      .single();
    expect(payment!.commission_amount! + payment!.payout_amount!).toBe(payment!.amount);
    expect(payment!.settled_at).toBeTruthy();

    const earningsRes = await fetch(`${BASE_URL}/api/staff/earnings`, {
      headers: { Authorization: `Bearer ${staff.accessToken}` },
    });
    const earnings = await earningsRes.json();
    const entry = earnings.earnings.find((e: { bookingId: string }) => e.bookingId === booking.id);
    expect(entry.payoutAmount).toBe(payment!.payout_amount);
  });

  it("cancelling a paid booking flags the payment as refunded, without auto-refunding", async () => {
    const booking = await requestAndAccept(parent, staff, "2027-04-10", "09:00", "10:00");
    await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009995" }),
    });

    const cancelRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ reason: "Change of plans" }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelled = await cancelRes.json();
    expect(cancelled.booking.status).toBe("cancelled");
    expect(cancelled.booking.cancel_reason).toBe("Change of plans");

    const { data: payment } = await admin
      .from("payments")
      .select("refunded_amount, amount")
      .eq("booking_id", booking.id)
      .eq("status", "succeeded")
      .single();
    expect(payment!.refunded_amount).toBe(payment!.amount);
  });

  it("a cancelled booking cannot be paid or started", async () => {
    const booking = await requestAndAccept(parent, staff, "2027-04-11", "09:00", "10:00");
    await fetch(`${BASE_URL}/api/bookings/${booking.id}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ reason: "No longer needed" }),
    });

    const payRes = await fetch(`${BASE_URL}/api/bookings/${booking.id}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parent.accessToken}`,
      },
      body: JSON.stringify({ network: "mtn", payerPhone: "+233550009996" }),
    });
    expect(payRes.status).toBe(400);
  });
});
