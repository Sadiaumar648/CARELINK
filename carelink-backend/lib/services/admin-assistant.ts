import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// CareLink's admin assistant — a read-only Q&A helper on the Admin
// dashboard. Unlike Nia (lib/services/care-assistant.ts, parent-facing,
// warm and conversational), this is an operational tool for the
// CareLink team: "are there reports to attend to," "how much revenue
// this week," "have I paid all caregivers." It NEVER writes to the
// database and never takes an action on the admin's behalf — every
// admin write (resolving a report, approving a verification, etc.)
// still happens on the admin's own dedicated pages. All it can do is
// call the read-only tools below and answer in plain language from
// what they return.
//
// Every tool here queries with the CALLING ADMIN's own RLS-scoped
// Supabase client (never service-role) — the same client every other
// /api/admin/* route already uses, and deliberately mirrors those
// routes' exact query shapes (overview, reports, payments, bookings,
// roster, verifications, reviews, parents) rather than inventing new
// ones, so an answer here always matches what the admin would see by
// clicking into that page themselves. Counts and sums are always
// computed here in code, never left for the model to tally from a raw
// list — a language model counting JSON rows is a real source of silent
// error this sidesteps entirely.

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MODEL = "claude-opus-5";
const MAX_TOOL_ROUNDS = 6;
const LIST_SAMPLE_LIMIT = 20;

type ToolHandler = (supabase: SupabaseClient, input: Record<string, unknown>) => Promise<unknown>;

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function getPlatformOverview(supabase: SupabaseClient, input: Record<string, unknown>) {
  const from =
    str(input, "fromISO") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = str(input, "toISO") ?? new Date().toISOString();

  const [bookingsRes, paymentsRes, staffRes, verificationsRes, reportsRes, careRequestsRes] =
    await Promise.all([
      supabase.from("bookings").select("status").gte("created_at", from).lte("created_at", to),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "succeeded")
        .gte("settled_at", from)
        .lte("settled_at", to),
      supabase
        .from("staff_profiles")
        .select("id, accepting_bookings, dispatch_available, users!inner(account_status)"),
      supabase
        .from("verification_submissions")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1),
      supabase.from("reports").select("id").in("status", ["open", "investigating"]),
      supabase.from("care_requests").select("id").in("dispatch_status", ["searching", "expanding"]),
    ]);
  if (bookingsRes.error) throw bookingsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (staffRes.error) throw staffRes.error;
  if (verificationsRes.error) throw verificationsRes.error;
  if (reportsRes.error) throw reportsRes.error;
  if (careRequestsRes.error) throw careRequestsRes.error;

  const bookingsByStatus: Record<string, number> = {};
  for (const b of bookingsRes.data ?? []) {
    bookingsByStatus[b.status] = (bookingsByStatus[b.status] ?? 0) + 1;
  }
  const totalBookings = bookingsRes.data?.length ?? 0;
  const revenueCedis = (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount, 0);

  const activeStaffCount = (staffRes.data ?? []).filter(
    (s) =>
      s.accepting_bookings &&
      (s.users as unknown as { account_status: string })?.account_status === "active",
  ).length;
  const availableCaregiversNow = (staffRes.data ?? []).filter(
    (s) => s.dispatch_available === true,
  ).length;

  return {
    period: { from, to },
    totalBookings,
    bookingsByStatus,
    revenueCedis,
    revenueNote: "Sum of succeeded, settled payments in this window. Amounts in GHS.",
    activeAcceptingCaregivers: activeStaffCount,
    availableCaregiversRightNow: availableCaregiversNow,
    careRequestsStillSearching: careRequestsRes.data?.length ?? 0,
    openOrInvestigatingReports: reportsRes.data?.length ?? 0,
    oldestPendingVerificationSince: verificationsRes.data?.[0]?.created_at ?? null,
  };
}

async function getReports(supabase: SupabaseClient, input: Record<string, unknown>) {
  const status = str(input, "status");
  let query = supabase
    .from("reports")
    .select(
      "id, category, description, status, created_at, reporter:users!reports_reporter_id_fkey(full_name), subject:users!reports_subject_user_id_fkey(full_name, role)",
    )
    .order("created_at", { ascending: true })
    .limit(LIST_SAMPLE_LIMIT);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  const { count: openCount } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "investigating"]);

  return {
    totalOpenOrInvestigating: openCount ?? 0,
    reports: (data ?? []).map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      reporterName: (r.reporter as unknown as { full_name: string } | null)?.full_name ?? null,
      subjectName:
        (r.subject as unknown as { full_name: string; role: string } | null)?.full_name ?? null,
      subjectRole:
        (r.subject as unknown as { full_name: string; role: string } | null)?.role ?? null,
    })),
    note: "Oldest first, capped at 20 rows — ask for a status filter to narrow further.",
  };
}

async function getPayments(supabase: SupabaseClient, input: Record<string, unknown>) {
  const status = str(input, "status");
  const from = str(input, "fromISO");
  const to = str(input, "toISO");

  let query = supabase
    .from("payments")
    .select(
      "id, booking_id, network, amount, status, failure_reason, settled_at, created_at, bookings(reference)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_SAMPLE_LIMIT);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;

  let totalsQuery = supabase.from("payments").select("amount, status");
  if (from) totalsQuery = totalsQuery.gte("created_at", from);
  if (to) totalsQuery = totalsQuery.lte("created_at", to);
  const { data: totalsData, error: totalsErr } = await totalsQuery;
  if (totalsErr) throw totalsErr;
  const totalsByStatus: Record<string, { count: number; amountCedis: number }> = {};
  for (const p of totalsData ?? []) {
    const bucket = (totalsByStatus[p.status] ??= { count: 0, amountCedis: 0 });
    bucket.count += 1;
    bucket.amountCedis += p.amount;
  }

  return {
    totalsByStatus,
    recentSample: (data ?? []).map((p) => {
      const booking = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings;
      return {
        bookingReference: (booking as { reference: string } | null)?.reference ?? null,
        network: p.network,
        amountCedis: p.amount,
        status: p.status,
        failureReason: p.failure_reason,
        settledAt: p.settled_at,
        createdAt: p.created_at,
      };
    }),
  };
}

async function getBookings(supabase: SupabaseClient, input: Record<string, unknown>) {
  const status = str(input, "status");
  const from = str(input, "fromISO");
  const to = str(input, "toISO");

  let query = supabase
    .from("bookings")
    .select("id, reference, status, starts_at, ends_at, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_SAMPLE_LIMIT);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) throw error;

  let countsQuery = supabase.from("bookings").select("status");
  if (from) countsQuery = countsQuery.gte("created_at", from);
  if (to) countsQuery = countsQuery.lte("created_at", to);
  const { data: countsData, error: countsErr } = await countsQuery;
  if (countsErr) throw countsErr;
  const byStatus: Record<string, number> = {};
  for (const b of countsData ?? []) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

  return {
    totalMatching: countsData?.length ?? 0,
    byStatus,
    recentSample: (data ?? []).map((b) => ({
      reference: b.reference,
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      totalAmountCedis: b.total_amount,
      createdAt: b.created_at,
    })),
  };
}

async function getCaregivers(supabase: SupabaseClient, input: Record<string, unknown>) {
  const verificationStatus = str(input, "verificationStatus");
  const acceptingOnly = input.acceptingBookingsOnly === true;

  let query = supabase
    .from("users")
    .select(
      "id, full_name, verification_status, account_status, created_at, staff_profiles(caregiver_type, rating_avg, rating_count, bookings_completed, accepting_bookings, dispatch_available)",
    )
    .eq("role", "staff")
    .order("created_at", { ascending: false });
  if (verificationStatus) query = query.eq("verification_status", verificationStatus);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const profile = Array.isArray(row.staff_profiles) ? row.staff_profiles[0] : row.staff_profiles;
    return {
      fullName: row.full_name,
      verificationStatus: row.verification_status,
      accountStatus: row.account_status,
      caregiverType: profile?.caregiver_type ?? null,
      ratingAvg: profile?.rating_avg ?? null,
      bookingsCompleted: profile?.bookings_completed ?? 0,
      acceptingBookings: profile?.accepting_bookings ?? false,
      availableNow: profile?.dispatch_available ?? false,
    };
  });
  const filtered = acceptingOnly ? rows.filter((r) => r.acceptingBookings) : rows;

  const byVerificationStatus: Record<string, number> = {};
  for (const r of rows) {
    byVerificationStatus[r.verificationStatus] =
      (byVerificationStatus[r.verificationStatus] ?? 0) + 1;
  }

  return {
    totalCaregivers: rows.length,
    byVerificationStatus,
    acceptingBookingsCount: rows.filter((r) => r.acceptingBookings).length,
    availableRightNowCount: rows.filter((r) => r.availableNow).length,
    sample: filtered.slice(0, LIST_SAMPLE_LIMIT),
  };
}

async function getFamilies(supabase: SupabaseClient, input: Record<string, unknown>) {
  const verificationStatus = str(input, "verificationStatus");

  let query = supabase
    .from("users")
    .select("id, full_name, verification_status, account_status, created_at, parent_profiles(area)")
    .eq("role", "parent")
    .order("created_at", { ascending: false });
  if (verificationStatus) query = query.eq("verification_status", verificationStatus);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const profile = Array.isArray(row.parent_profiles)
      ? row.parent_profiles[0]
      : row.parent_profiles;
    return {
      fullName: row.full_name,
      verificationStatus: row.verification_status,
      accountStatus: row.account_status,
      area: profile?.area ?? null,
      createdAt: row.created_at,
    };
  });

  const byVerificationStatus: Record<string, number> = {};
  for (const r of rows) {
    byVerificationStatus[r.verificationStatus] =
      (byVerificationStatus[r.verificationStatus] ?? 0) + 1;
  }

  return {
    totalFamilies: rows.length,
    byVerificationStatus,
    sample: rows.slice(0, LIST_SAMPLE_LIMIT),
  };
}

async function getPendingVerifications(supabase: SupabaseClient, input: Record<string, unknown>) {
  const role = str(input, "role");
  const query = supabase
    .from("verification_submissions")
    .select("id, created_at, users!verification_submissions_user_id_fkey(full_name, role)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(LIST_SAMPLE_LIMIT);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => ({
    fullName:
      (row.users as unknown as { full_name: string; role: string } | null)?.full_name ?? null,
    role: (row.users as unknown as { full_name: string; role: string } | null)?.role ?? null,
    submittedAt: row.created_at,
  }));
  const filtered = role ? rows.filter((r) => r.role === role) : rows;

  return {
    totalPending: filtered.length,
    oldestSubmittedAt: filtered[0]?.submittedAt ?? null,
    submissions: filtered,
  };
}

async function getReviews(supabase: SupabaseClient, input: Record<string, unknown>) {
  const maxRating = typeof input.maxRating === "number" ? input.maxRating : undefined;

  let parentReviewsQuery = supabase
    .from("reviews")
    .select("id, rating, comment, hidden_by_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_SAMPLE_LIMIT);
  if (maxRating != null) parentReviewsQuery = parentReviewsQuery.lte("rating", maxRating);

  let caregiverReviewsQuery = supabase
    .from("caregiver_reviews")
    .select("id, rating, comment, hidden_by_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_SAMPLE_LIMIT);
  if (maxRating != null) caregiverReviewsQuery = caregiverReviewsQuery.lte("rating", maxRating);

  const [parentRes, caregiverRes] = await Promise.all([parentReviewsQuery, caregiverReviewsQuery]);
  if (parentRes.error) throw parentRes.error;
  if (caregiverRes.error) throw caregiverRes.error;

  const { data: allParentRatings, error: parentRatingsErr } = await supabase
    .from("reviews")
    .select("rating");
  if (parentRatingsErr) throw parentRatingsErr;
  const { data: allCaregiverRatings, error: caregiverRatingsErr } = await supabase
    .from("caregiver_reviews")
    .select("rating");
  if (caregiverRatingsErr) throw caregiverRatingsErr;
  const avg = (rows: { rating: number }[] | null) =>
    rows && rows.length > 0 ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;

  return {
    parentToCaregiverReviews: {
      total: allParentRatings?.length ?? 0,
      averageRating: avg(allParentRatings),
      recentSample: (parentRes.data ?? []).map((r) => ({
        rating: r.rating,
        comment: r.comment,
        hiddenByAdmin: r.hidden_by_admin,
        createdAt: r.created_at,
      })),
    },
    caregiverToParentReviews: {
      total: allCaregiverRatings?.length ?? 0,
      averageRating: avg(allCaregiverRatings),
      recentSample: (caregiverRes.data ?? []).map((r) => ({
        rating: r.rating,
        comment: r.comment,
        hiddenByAdmin: r.hidden_by_admin,
        createdAt: r.created_at,
      })),
    },
  };
}

// Directly answers "have I paid all caregivers" — a completed booking
// whose payment never got settled (payout_amount still null) is the
// one honest signal of that; this should normally come back empty now
// that sessions settle automatically on completion
// (lib/services/session-lifecycle.ts), so a non-empty result usually
// means an older booking that predates that, or a real problem worth
// looking into.
async function getUnsettledPayouts(supabase: SupabaseClient) {
  const { data: completedBookings, error: bookingsErr } = await supabase
    .from("bookings")
    .select("id, reference, completed_at")
    .eq("status", "completed");
  if (bookingsErr) throw bookingsErr;
  const completedIds = (completedBookings ?? []).map((b) => b.id);
  if (completedIds.length === 0) {
    return { unsettledCount: 0, unsettled: [], note: "No completed bookings yet." };
  }

  const { data: payments, error: paymentsErr } = await supabase
    .from("payments")
    .select("booking_id, status, payout_amount")
    .in("booking_id", completedIds);
  if (paymentsErr) throw paymentsErr;

  const paymentByBookingId = new Map(payments?.map((p) => [p.booking_id, p]) ?? []);
  const unsettled = (completedBookings ?? [])
    .filter((b) => {
      const payment = paymentByBookingId.get(b.id);
      return !payment || payment.status !== "succeeded" || payment.payout_amount == null;
    })
    .map((b) => ({
      bookingReference: b.reference,
      completedAt: b.completed_at,
      reason: !paymentByBookingId.get(b.id)
        ? "no payment record found"
        : paymentByBookingId.get(b.id)?.status !== "succeeded"
          ? `payment status is '${paymentByBookingId.get(b.id)?.status}', not succeeded`
          : "payout not yet settled",
    }));

  return {
    totalCompletedBookings: completedIds.length,
    unsettledCount: unsettled.length,
    unsettled: unsettled.slice(0, LIST_SAMPLE_LIMIT),
  };
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_platform_overview",
    description:
      "Get a snapshot of CareLink activity for a date range: bookings by status, total settled revenue (GHS), active/available caregiver counts, care requests still searching for a match, open safety reports, and the oldest pending identity verification. Defaults to the last 30 days.",
    input_schema: {
      type: "object",
      properties: {
        fromISO: { type: "string", description: "Start of range, ISO 8601. Optional." },
        toISO: { type: "string", description: "End of range, ISO 8601. Optional." },
      },
    },
  },
  {
    name: "get_reports",
    description:
      "List safety/conduct reports filed by parents or caregivers — who filed it, who it's about, category, and status. Use for 'any reports to attend to' type questions.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "investigating", "resolved"] },
      },
    },
  },
  {
    name: "get_payments",
    description:
      "List individual Mobile Money payment records with totals by status (count + GHS amount). Use for payment/revenue questions more detailed than the overview, or to find failed/pending payments.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["initiated", "pending", "succeeded", "failed", "timed_out", "refunded"],
        },
        fromISO: { type: "string" },
        toISO: { type: "string" },
      },
    },
  },
  {
    name: "get_bookings",
    description: "List bookings with counts by status. Use for booking-volume questions.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "pending",
            "accepted",
            "declined",
            "expired",
            "paid",
            "active",
            "completed",
            "cancelled",
            "disputed",
          ],
        },
        fromISO: { type: "string" },
        toISO: { type: "string" },
      },
    },
  },
  {
    name: "get_caregivers",
    description:
      "List caregivers (nannies/babysitters) with verification status, rating, completed bookings, and whether they're currently accepting bookings or available right now.",
    input_schema: {
      type: "object",
      properties: {
        verificationStatus: {
          type: "string",
          enum: ["unverified", "pending", "verified", "rejected"],
        },
        acceptingBookingsOnly: { type: "boolean" },
      },
    },
  },
  {
    name: "get_families",
    description: "List parent/family accounts with verification status and area.",
    input_schema: {
      type: "object",
      properties: {
        verificationStatus: {
          type: "string",
          enum: ["unverified", "pending", "verified", "rejected"],
        },
      },
    },
  },
  {
    name: "get_pending_verifications",
    description:
      "List identity verification submissions still awaiting admin review, oldest first.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["parent", "staff"] },
      },
    },
  },
  {
    name: "get_reviews",
    description:
      "Get review stats and a recent sample, in both directions: parents reviewing caregivers, and caregivers reviewing parents. Use for 'any complaints' or satisfaction questions.",
    input_schema: {
      type: "object",
      properties: {
        maxRating: {
          type: "number",
          description: "Only include reviews at or below this star rating (1-5).",
        },
      },
    },
  },
  {
    name: "get_unsettled_payouts",
    description:
      "Find completed bookings whose caregiver payout hasn't been settled yet. This is the direct answer to 'have I paid all caregivers' — normally empty.",
    input_schema: { type: "object", properties: {} },
  },
];

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_platform_overview: getPlatformOverview,
  get_reports: getReports,
  get_payments: getPayments,
  get_bookings: getBookings,
  get_caregivers: getCaregivers,
  get_families: getFamilies,
  get_pending_verifications: getPendingVerifications,
  get_reviews: getReviews,
  get_unsettled_payouts: (supabase) => getUnsettledPayouts(supabase),
};

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    "You are CareLink's admin assistant — an internal, read-only Q&A tool for the CareLink " +
    "operations team on a Ghanaian childcare marketplace. You help an admin quickly understand " +
    "what's happening on the platform: reports needing attention, revenue, bookings, caregivers, " +
    "families, verifications, reviews, and whether caregivers have been paid out. " +
    "\n\nYou can ONLY read data, via the tools provided. You can NEVER take an action — you cannot " +
    "resolve a report, approve or reject a verification, pay a caregiver, cancel a booking, or " +
    "change anything. If asked to do something like that, say plainly that you can't take actions " +
    "and point to the relevant admin page (e.g. Reports, Verifications, Roster) where they can do " +
    "it themselves. " +
    "\n\nAlways call a tool to get real figures before answering a factual question — never guess, " +
    "estimate, or recall a number from earlier in the conversation if it might have changed. Use as " +
    "many tool calls as needed to fully answer a question (e.g. a broad question may need several " +
    "tools). All monetary figures from tools are already in GHS (cedis), not pesewas — state amounts " +
    `as GHS. Today's date is ${today}; resolve relative ranges ("this week," "today," "this month") ` +
    "against it yourself when calling a tool with fromISO/toISO. " +
    "\n\nAnswer concisely and directly, like a capable operations colleague — lead with the number " +
    "or the answer, then brief supporting detail only if useful. No filler, no over-explaining. If a " +
    "question is outside CareLink's data entirely, say so briefly rather than inventing an answer."
  );
}

export async function runAdminAssistantTurn(
  history: ChatTurn[],
  supabase: SupabaseClient,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, timeout: 30000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        return textBlock?.text.trim() || "I don't have an answer for that right now.";
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const handler = TOOL_HANDLERS[block.name];
          if (!handler) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: `Unknown tool: ${block.name}`,
              is_error: true,
            };
          }
          try {
            const result = await handler(supabase, (block.input as Record<string, unknown>) ?? {});
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: err instanceof Error ? err.message : "Tool failed",
              is_error: true,
            };
          }
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    return "That question needs more digging than I can do right now — try narrowing it down.";
  } catch {
    return null;
  }
}
