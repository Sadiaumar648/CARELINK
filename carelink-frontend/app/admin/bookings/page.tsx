"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CaretDown,
  CaretLeft,
  CaretRight,
  DotsThreeVertical,
  Download,
  MagnifyingGlass,
  MapPin,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";
import { CaregiverLocationView } from "@/components/caregiver-location-view";
import { caregiverPhotoUrl } from "@/lib/photo-url";

// Admin "Bookings" — redesigned to match the approved reference image.
// Reuses the existing GET /api/admin/bookings (unmodified) joined
// client-side with GET /api/admin/roster and GET /api/admin/parents
// (both already existing; roster additively gained a `photoPath`
// field for this page's real caregiver avatars). No booking/dispatch/
// payment logic touched anywhere here — this is read-only.
//
// A few deliberate departures from the literal reference, all because
// the real data model doesn't support what it shows:
// - Care type is "Nanny" / "Babysitter" only — CareLink has no
//   full-time/part-time distinction (the mockup's "Nanny (Full-time)"
//   isn't a real field).
// - Every real `bookings` row already has an assigned caregiver — an
//   "unassigned, Finding caregiver" booking doesn't exist in this
//   schema; a still-searching request lives in `care_requests`
//   (its own page, /admin/care-requests) until a caregiver accepts and
//   a real booking row is created. Nothing here fabricates that state.
// - "Paid" is kept as its own filter tab (missing from the reference)
//   since it's a real, operationally important status — the same one
//   Admin Home's Needs Attention already surfaces as "Payments
//   awaiting action".
// - Export is real: a CSV of whatever's currently filtered/searched,
//   built client-side from the same real rows already on the page —
//   not a stub, and no fake export formats offered.
// - Pagination is client-side over the existing route's up-to-200-row
//   result (that route has no server-side offset/cursor support) —
//   real for the data actually loaded, not simulated.

type Booking = {
  id: string;
  reference: string;
  parent_profile_id: string;
  staff_profile_id: string;
  address: string;
  starts_at: string;
  ends_at: string;
  total_amount: number;
  status: string;
};

type RosterEntry = {
  id: string;
  staffProfileId: string | null;
  fullName: string;
  photoPath: string | null;
  caregiverType: "nanny" | "babysitter" | null;
  ratingAvg: number | null;
};

type ParentEntry = {
  id: string;
  parentProfileId: string | null;
  fullName: string;
  area: string | null;
};

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  paid: "Paid",
  active: "In Progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  disputed: "Disputed",
};

const STATUS_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  pending: "info",
  accepted: "positive",
  paid: "positive",
  active: "info",
  completed: "neutral",
  declined: "attention",
  cancelled: "attention",
  expired: "neutral",
  disputed: "attention",
};

const FILTER_TABS = [
  { key: "", label: "All Bookings" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "paid", label: "Paid" },
  { key: "active", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const PAGE_SIZE = 10;

// A compact (28px) avatar for this table's dense rows — the shared
// Avatar component's smallest size (48px) doesn't fit here, so this
// mirrors its own real-photo-with-initials-fallback logic at the size
// this specific table needs, rather than fighting its size classes
// with an override or changing the shared component's sizing for
// every other page that uses it.
function CompactAvatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a public storage URL, not a static asset
      <img src={photoUrl} alt={name} className="h-7 w-7 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-[10.5px] font-semibold text-wisteria-pressed">
      {initialsFor(name)}
    </span>
  );
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A light presentational trim of the real address — drops the first
// comma-segment (the exact street line) to show a general area, the
// same approach the Caregiver Schedule page already uses. Admin's own
// RLS already permits the full address (shown in the expanded detail
// below); this is purely a compact-table-column choice.
function generalArea(address: string): string {
  const parts = address.split(",");
  return parts.length > 1 ? parts.slice(1).join(",").trim() : address;
}

function formatDateTime(startsAt: string, endsAt: string): { date: string; time: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { date, time: `${t(start)} – ${t(end)}` };
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(
  rows: Booking[],
  rosterById: Map<string | null, RosterEntry>,
  parentsById: Map<string | null, ParentEntry>,
) {
  const header = [
    "Booking ID",
    "Care Type",
    "Parent",
    "Caregiver",
    "Date & Time",
    "Location",
    "Amount",
    "Status",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const b of rows) {
    const caregiver = rosterById.get(b.staff_profile_id);
    const parent = parentsById.get(b.parent_profile_id);
    const { date, time } = formatDateTime(b.starts_at, b.ends_at);
    lines.push(
      [
        b.reference,
        caregiver?.caregiverType ? CAREGIVER_TYPE_LABEL[caregiver.caregiverType] : "",
        parent?.fullName ?? "",
        caregiver?.fullName ?? "",
        `${date} ${time}`,
        generalArea(b.address),
        String(b.total_amount),
        STATUS_LABEL[b.status] ?? b.status,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carelink-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function RowActions({ reference }: { reference: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-[12px] border border-hairline bg-sheet py-1 shadow-[var(--shadow-card-hover)]">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(reference).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
              setOpen(false);
            }}
            className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-ink hover:bg-wisteria-tint"
          >
            {copied ? "Copied!" : "Copy Booking ID"}
          </button>
        </div>
      )}
    </div>
  );
}

function BookingDetailPanel({ booking }: { booking: Booking }) {
  return (
    <div className="flex flex-col gap-3 border-t border-hairline bg-[var(--color-lavender-bg)] px-5 py-4">
      <p className="text-[13px] text-ink-muted">{booking.address}</p>
      {booking.status === "active" ? (
        <CaregiverLocationView bookingId={booking.id} active />
      ) : (
        <p className="text-[12.5px] text-ink-muted">
          Caregiver location is only shown for a currently active booking.
        </p>
      )}
    </div>
  );
}

function AdminBookingsPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [parents, setParents] = useState<ParentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const params = status ? `?status=${status}` : "";
    apiFetch<{ bookings: Booking[] }>(`/api/admin/bookings${params}`)
      .then((res) => {
        if (cancelled) return;
        setError(null);
        setBookings(res.bookings);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [status, retryKey]);

  useEffect(() => {
    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => setRoster(res.roster))
      .catch(() => setRoster([]));
    apiFetch<{ parents: ParentEntry[] }>("/api/admin/parents")
      .then((res) => setParents(res.parents))
      .catch(() => setParents([]));
  }, []);

  const rosterByStaffProfileId = useMemo(
    () => new Map((roster ?? []).map((r) => [r.staffProfileId, r] as const)),
    [roster],
  );
  const parentsByProfileId = useMemo(
    () => new Map((parents ?? []).map((p) => [p.parentProfileId, p] as const)),
    [parents],
  );

  const filtered = useMemo(() => {
    if (!bookings) return null;
    const q = query.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const caregiver = rosterByStaffProfileId.get(b.staff_profile_id);
      const parent = parentsByProfileId.get(b.parent_profile_id);
      return (
        b.reference.toLowerCase().includes(q) ||
        (parent?.fullName.toLowerCase().includes(q) ?? false) ||
        (caregiver?.fullName.toLowerCase().includes(q) ?? false)
      );
    });
  }, [bookings, query, rosterByStaffProfileId, parentsByProfileId]);

  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageItems = filtered ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">Bookings</h1>
        <p className="text-[14px] text-ink-muted">
          Monitor, review and manage all care requests across CareLink.
        </p>
      </div>

      {error && (
        <ErrorState
          onRetry={() => {
            setError(null);
            setRetryKey((k) => k + 1);
          }}
        />
      )}

      {!error && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by booking ID, parent or caregiver…"
              aria-label="Search bookings"
              className="w-full rounded-[12px] border border-hairline bg-sheet py-3 pl-10 pr-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
            />
          </div>
          <button
            type="button"
            disabled={!filtered || filtered.length === 0}
            onClick={() =>
              filtered && downloadCsv(filtered, rosterByStaffProfileId, parentsByProfileId)
            }
            className="flex items-center gap-2 rounded-[12px] border border-hairline bg-sheet px-4 py-3 text-[13.5px] font-semibold text-ink hover:border-wisteria/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} /> Export <CaretDown size={12} className="text-ink-muted" />
          </button>
        </div>
      )}

      {!error && (
        <div className="flex flex-wrap gap-1 border-b border-hairline">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              className={`border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${
                status === tab.key
                  ? "border-wisteria text-wisteria"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {!error && bookings === null && (
        <div className="flex flex-col gap-4">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {!error && filtered?.length === 0 && (
        <EmptyState
          icon={MagnifyingGlass}
          title="No bookings found"
          description="Try a different search or filter."
        />
      )}

      {!error && filtered && filtered.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-[16px] border border-hairline bg-sheet">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Booking ID</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Care Type</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Parent</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Caregiver</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Date &amp; Time</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Location</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Amount</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Status</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((b) => {
                  const caregiver = rosterByStaffProfileId.get(b.staff_profile_id);
                  const parent = parentsByProfileId.get(b.parent_profile_id);
                  const { date, time } = formatDateTime(b.starts_at, b.ends_at);
                  const open = openId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className="border-b border-hairline last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-wisteria">
                          {b.reference}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                caregiver?.caregiverType === "nanny"
                                  ? "bg-wisteria-tint text-wisteria-pressed"
                                  : "bg-gold-tint text-[var(--color-gold)]"
                              }`}
                            >
                              {caregiver?.caregiverType === "nanny" ? (
                                <Moon size={12} weight="fill" />
                              ) : (
                                <Sun size={12} weight="fill" />
                              )}
                            </span>
                            {caregiver?.caregiverType
                              ? CAREGIVER_TYPE_LABEL[caregiver.caregiverType]
                              : "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bluebell-tint text-[10.5px] font-semibold text-[var(--color-bluebell-pressed)]">
                              {parent ? initialsFor(parent.fullName) : "?"}
                            </span>
                            <span className="flex flex-col">
                              <span className="text-ink">{parent?.fullName ?? "Unknown"}</span>
                              {parent?.area && (
                                <span className="text-[11.5px] text-ink-muted">{parent.area}</span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="flex items-center gap-2">
                            <CompactAvatar
                              photoUrl={caregiverPhotoUrl(caregiver?.photoPath ?? null)}
                              name={caregiver?.fullName ?? "?"}
                            />
                            <span className="flex flex-col">
                              <span className="text-ink">{caregiver?.fullName ?? "Unknown"}</span>
                              {caregiver?.ratingAvg && (
                                <span className="text-[11.5px] text-ink-muted">
                                  ★ {caregiver.ratingAvg.toFixed(1)}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          <span className="flex flex-col">
                            <span>{date}</span>
                            <span className="text-[11.5px]">{time}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          <span className="flex items-center gap-1">
                            <MapPin size={13} />
                            {generalArea(b.address)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">
                          GH₵{b.total_amount.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge
                            label={STATUS_LABEL[b.status] ?? b.status}
                            tone={STATUS_TONE[b.status] ?? "neutral"}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : b.id)}
                              className="rounded-[8px] border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-wisteria hover:border-wisteria/50"
                            >
                              View
                            </button>
                            <RowActions reference={b.reference} />
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <BookingDetailPanel booking={b} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-ink-muted">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} bookings
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-hairline text-ink-muted hover:border-wisteria/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CaretLeft size={14} />
              </button>
              <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-wisteria text-[12.5px] font-semibold text-sheet">
                {page}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-hairline text-ink-muted hover:border-wisteria/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CaretRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminBookingsPageWrapper() {
  return (
    <Suspense>
      <AdminBookingsPage />
    </Suspense>
  );
}
