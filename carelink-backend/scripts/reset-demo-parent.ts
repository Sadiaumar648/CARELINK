import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(__dirname, "../.env.local") });

// Deletes the parent demo account below outright, so you can walk
// through the real /register -> /verify-identity -> Parent Home flow
// again from a totally clean state, as many times as you like. Hardcoded
// on purpose (not a CLI arg) so this can only ever touch this one
// demo.*@carelink.test address, never a real parent's account.
//
// Run it (from carelink-backend/):
//   npm run demo:reset-parent
//
// Then go to /register and sign up with the same email again.

const EMAIL = "demo.family@carelink.test";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: user } = await admin.from("users").select("id").eq("email", EMAIL).maybeSingle();

  if (!user) {
    console.log(`No account exists for ${EMAIL} — nothing to reset. It's free to register.`);
    return;
  }

  const { data: profile } = await admin
    .from("parent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("id")
      .eq("parent_profile_id", profile.id);
    const bookingIds = (bookings ?? []).map((b) => b.id);

    if (bookingIds.length > 0) {
      console.log(`Clearing ${bookingIds.length} booking(s)...`);
      for (const table of [
        "notifications",
        "email_notifications",
        "messages",
        "reviews",
        "caregiver_reviews",
        "payments",
        "reports",
        "booking_events",
        "caregiver_locations",
      ]) {
        const { error } = await admin.from(table).delete().in("booking_id", bookingIds);
        if (error && !/does not exist|column .* does not exist/i.test(error.message)) {
          console.log(`  (skip ${table}: ${error.message})`);
        }
      }
      const { error: bErr } = await admin.from("bookings").delete().in("id", bookingIds);
      if (bErr) throw new Error("delete bookings: " + bErr.message);
    }

    const { data: careRequests } = await admin
      .from("care_requests")
      .select("id")
      .eq("parent_profile_id", profile.id);
    if (careRequests?.length) {
      const { error } = await admin
        .from("care_requests")
        .delete()
        .eq("parent_profile_id", profile.id);
      if (error) console.log("  (skip care_requests: " + error.message + ")");
    }

    await admin.from("wards").delete().eq("parent_profile_id", profile.id);
    await admin.from("parent_profiles").delete().eq("id", profile.id);
  }

  await admin.from("parent_identity_verifications").delete().eq("user_id", user.id);
  for (const table of ["notifications", "email_notifications"]) {
    await admin.from(table).delete().eq("user_id", user.id);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) throw new Error("deleteUser: " + delErr.message);

  console.log(`${EMAIL} fully deleted. Go to /register and sign up with it again.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
