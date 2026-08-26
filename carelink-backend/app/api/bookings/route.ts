import { NextResponse } from "next/server";
import { z } from "zod";
import { createBookingRequestSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { generateBookingReference } from "@/lib/bookings";
import { getOwnParentProfileId } from "@/lib/parents";
import {
  checkAvailability,
  type AvailabilityException,
  type AvailabilityWindow,
  type BusyRange,
} from "@/lib/services/availability";

const AVAILABILITY_REASON_MESSAGES: Record<string, string> = {
  outside_declared_hours: "This caregiver hasn't declared availability for this time.",
  marked_unavailable: "This caregiver has marked this date unavailable.",
  conflicts_with_existing_booking: "This caregiver already has a booking at this time.",
};

// Task 2.11. Rate and total are snapshotted from the caregiver's profile
// at request time (doc 5, §4.8) — a later rate change never rewrites an
// existing request. Verification gating (an unverified parent is stopped
// before the sheet even opens) is task 3.3, once that workflow exists;
// this route only enforces what it can today: household completeness,
// the ward belonging to this parent, and real availability.
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);

    const { data: caller } = await supabase
      .from("users")
      .select("verification_status")
      .eq("id", userId)
      .single();
    if (caller?.verification_status !== "verified") {
      return NextResponse.json(
        { error: "Verify your account before requesting a booking" },
        { status: 403 },
      );
    }

    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    if (!parentProfileId) {
      return NextResponse.json({ error: "Complete your household profile first" }, { status: 400 });
    }

    const body = createBookingRequestSchema.parse(await request.json());

    const { data: ward, error: wardErr } = await supabase
      .from("wards")
      .select("id")
      .eq("id", body.wardId)
      .maybeSingle();
    if (wardErr) return NextResponse.json({ error: wardErr.message }, { status: 500 });
    if (!ward) return NextResponse.json({ error: "Ward not found" }, { status: 404 });

    const { data: caregiver, error: caregiverErr } = await supabase
      .from("public_caregivers")
      .select("staff_profile_id, hourly_rate")
      .eq("staff_profile_id", body.staffProfileId)
      .maybeSingle();
    if (caregiverErr) return NextResponse.json({ error: caregiverErr.message }, { status: 500 });
    if (!caregiver) {
      return NextResponse.json(
        { error: "Caregiver not found or not accepting bookings" },
        { status: 404 },
      );
    }

    const startsAt = new Date(`${body.date}T${body.startTime}:00Z`);
    const endsAt = new Date(`${body.date}T${body.endTime}:00Z`);

    const [windowsRes, exceptionsRes, busyRes] = await Promise.all([
      supabase
        .from("caregiver_availability_windows")
        .select("*")
        .eq("staff_profile_id", body.staffProfileId),
      supabase
        .from("caregiver_availability_exceptions")
        .select("*")
        .eq("staff_profile_id", body.staffProfileId),
      supabase.from("caregiver_busy_times").select("*").eq("staff_profile_id", body.staffProfileId),
    ]);
    if (windowsRes.error)
      return NextResponse.json({ error: windowsRes.error.message }, { status: 500 });
    if (exceptionsRes.error) {
      return NextResponse.json({ error: exceptionsRes.error.message }, { status: 500 });
    }
    if (busyRes.error) return NextResponse.json({ error: busyRes.error.message }, { status: 500 });

    const windows: AvailabilityWindow[] = (windowsRes.data ?? []).map((w) => ({
      weekday: w.weekday,
      startTime: String(w.start_time).slice(0, 5),
      endTime: String(w.end_time).slice(0, 5),
    }));
    const exceptions: AvailabilityException[] = (exceptionsRes.data ?? []).map((e) => ({
      onDate: e.on_date,
      unavailable: e.unavailable,
    }));
    const busy: BusyRange[] = (busyRes.data ?? []).map((b) => ({
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
    }));

    const availability = checkAvailability(windows, exceptions, busy, startsAt, endsAt);
    if (!availability.available) {
      return NextResponse.json(
        {
          error:
            AVAILABILITY_REASON_MESSAGES[availability.reason ?? ""] ?? "This time isn't available.",
          reason: availability.reason,
        },
        { status: 400 },
      );
    }

    const durationHours = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
    const totalAmount = Math.round(caregiver.hourly_rate * durationHours);

    const { data: booking, error: insertErr } = await supabase
      .from("bookings")
      .insert({
        reference: generateBookingReference(),
        parent_profile_id: parentProfileId,
        staff_profile_id: body.staffProfileId,
        ward_id: body.wardId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        hourly_rate: caregiver.hourly_rate,
        total_amount: totalAmount,
        address: body.address,
        one_off_notes: body.oneOffNotes ?? null,
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

// Task 2.13. RLS alone decides what comes back — a parent sees their own
// requests, a caregiver sees requests made to them, nothing more.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["parent", "staff", "admin"]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    let query = supabase.from("bookings").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bookings: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
