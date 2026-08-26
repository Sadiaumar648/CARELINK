import { NextResponse } from "next/server";
import { z } from "zod";
import { staffAvailabilitySchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Task 2.3. Windows and exceptions are both replaced wholesale on PUT —
// same reasoning as skills and areas.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const [windowsRes, exceptionsRes] = await Promise.all([
      supabase
        .from("availability_windows")
        .select("weekday, part, start_time, end_time")
        .eq("staff_profile_id", staffProfileId),
      supabase
        .from("availability_exceptions")
        .select("on_date, unavailable, note")
        .eq("staff_profile_id", staffProfileId),
    ]);

    if (windowsRes.error)
      return NextResponse.json({ error: windowsRes.error.message }, { status: 500 });
    if (exceptionsRes.error) {
      return NextResponse.json({ error: exceptionsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      windows: windowsRes.data.map((w) => ({
        weekday: w.weekday,
        part: w.part,
        startTime: w.start_time,
        endTime: w.end_time,
      })),
      exceptions: exceptionsRes.data.map((e) => ({
        onDate: e.on_date,
        unavailable: e.unavailable,
        note: e.note,
      })),
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const body = staffAvailabilitySchema.parse(await request.json());

    const [deleteWindows, deleteExceptions] = await Promise.all([
      supabase.from("availability_windows").delete().eq("staff_profile_id", staffProfileId),
      supabase.from("availability_exceptions").delete().eq("staff_profile_id", staffProfileId),
    ]);
    if (deleteWindows.error) {
      return NextResponse.json({ error: deleteWindows.error.message }, { status: 500 });
    }
    if (deleteExceptions.error) {
      return NextResponse.json({ error: deleteExceptions.error.message }, { status: 500 });
    }

    if (body.windows.length > 0) {
      const { error } = await supabase.from("availability_windows").insert(
        body.windows.map((w) => ({
          staff_profile_id: staffProfileId,
          weekday: w.weekday,
          part: w.part,
          start_time: w.startTime,
          end_time: w.endTime,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (body.exceptions.length > 0) {
      const { error } = await supabase.from("availability_exceptions").insert(
        body.exceptions.map((e) => ({
          staff_profile_id: staffProfileId,
          on_date: e.onDate,
          unavailable: e.unavailable,
          note: e.note ?? null,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ windows: body.windows, exceptions: body.exceptions });
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
