"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, CalendarCheck, Star, UsersThree } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton, Skeleton } from "@/components/ui/skeleton";

// The caregiver detail page "View Details" on the roster links to —
// none existed before this change. Deliberately reuses the three
// existing admin list routes (roster/bookings/reviews) filtered
// client-side to this one caregiver, rather than adding new backend
// routes: the agency's roster is small enough that this is simple and
// correct, and it means zero new backend surface for read-only detail
// data. The roster card stays simple; everything below — verification,
// booking history, reviews received — lives only here, per the design
// spec.

type RosterEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  accountStatus: string;
  verificationStatus: string;
  verificationMethod: "carelink" | "agency" | null;
  agencyReferenceId: string | null;
  existingAgencyUser: boolean;
  invitationStatus: "pending" | "claimed" | null;
  profileComplete: boolean;
  staffProfileId: string | null;
  caregiverType: "nanny" | "babysitter" | null;
  completedCareHours: number;
  dispatchAvailable: boolean;
  primaryArea: string | null;
  createdAt: string;
};

type BookingRow = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  status: string;
};

type ReviewRow = {
  id: string;
  direction: "parent_to_caregiver" | "caregiver_to_parent";
  rating: number;
  comment: string | null;
  reviewerName: string;
  reviewedUserId: string | null;
  createdAt: string;
};

const CAREGIVER_TYPE_LABEL: Record<"nanny" | "babysitter", string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

const VERIFICATION_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  unverified: "neutral",
  pending: "info",
  verified: "positive",
  rejected: "attention",
};

function verificationLabel(status: string, method: "carelink" | "agency" | null): string {
  if (status === "verified") {
    return method === "agency" ? "Verified by Agency" : "Verified";
  }
  if (status === "pending") return "Pending review";
  if (status === "rejected") return "Rejected";
  return "Verification required";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          weight={n <= rating ? "fill" : "regular"}
          className={n <= rating ? "text-gold" : "text-ink-muted/40"}
        />
      ))}
    </span>
  );
}

export default function AdminCaregiverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caregiver, setCaregiver] = useState<RosterEntry | null | undefined>(undefined);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ roster: RosterEntry[] }>("/api/admin/roster")
      .then((res) => {
        setError(null);
        setCaregiver(res.roster.find((r) => r.id === id) ?? null);
      })
      .catch((err) => setError(errorMessage(err)));

    apiFetch<{ bookings: BookingRow[] }>("/api/admin/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));

    apiFetch<{ reviews: ReviewRow[] }>("/api/admin/reviews")
      .then((res) => setReviews(res.reviews))
      .catch(() => setReviews([]));
  }, [id, retryKey]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (caregiver === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (caregiver === null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Link
          href="/admin/roster"
          className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
        >
          <ArrowLeft size={16} /> Back to Caregivers
        </Link>
        <EmptyState icon={UsersThree} title="Caregiver not found" />
      </div>
    );
  }

  const staffProfileId = caregiver.staffProfileId;
  const careHistory = staffProfileId
    ? (bookings ?? [])
        .filter((b) => b.staff_profile_id === staffProfileId)
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    : [];
  const reviewsReceived = (reviews ?? []).filter(
    (r) => r.direction === "parent_to_caregiver" && r.reviewedUserId === caregiver.id,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin/roster"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Caregivers
      </Link>

      <Sheet className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar photoUrl={null} name={caregiver.fullName} size="md" />
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold font-heading text-ink">
              {caregiver.fullName}
            </h1>
            <p className="text-[13.5px] text-ink-muted">
              {caregiver.phone} · {caregiver.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Type
            </p>
            <p className="text-[14px] text-ink">
              {caregiver.caregiverType ? CAREGIVER_TYPE_LABEL[caregiver.caregiverType] : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Profile
            </p>
            <p className="text-[14px] text-ink">
              {caregiver.profileComplete ? "Complete" : "Incomplete"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Availability
            </p>
            <p className="flex items-center gap-1.5 text-[14px] text-ink">
              <span
                className={`h-2 w-2 rounded-full ${caregiver.dispatchAvailable ? "bg-[var(--color-success)]" : "bg-ink-muted/40"}`}
                aria-hidden
              />
              {caregiver.dispatchAvailable ? "Available" : "Off Duty"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Completed Care
            </p>
            <p className="text-[14px] text-ink">{caregiver.completedCareHours} hours</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Account status
            </p>
            <p className="text-[14px] text-ink capitalize">{caregiver.accountStatus}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Area
            </p>
            <p className="text-[14px] text-ink">{caregiver.primaryArea ?? "Not set"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <StatusBadge
            label={verificationLabel(caregiver.verificationStatus, caregiver.verificationMethod)}
            tone={VERIFICATION_TONE[caregiver.verificationStatus] ?? "neutral"}
          />
          <StatusBadge
            label={caregiver.existingAgencyUser ? "Existing agency caregiver" : "New caregiver"}
            tone="neutral"
          />
          {caregiver.agencyReferenceId && (
            <span className="text-[12.5px] text-ink-muted">
              Agency ref: {caregiver.agencyReferenceId}
            </span>
          )}
          {caregiver.invitationStatus === "pending" && (
            <StatusBadge label="Invitation pending" tone="info" />
          )}
        </div>
      </Sheet>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Booking History</h2>
        {bookings === null && (
          <div className="flex flex-col gap-2">
            <BookingCardSkeleton />
          </div>
        )}
        {bookings && careHistory.length === 0 && (
          <EmptyState icon={CalendarCheck} title="No bookings yet" />
        )}
        {bookings && careHistory.length > 0 && (
          <div className="flex flex-col gap-2">
            {careHistory.slice(0, 15).map((b) => (
              <Sheet key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{b.reference}</p>
                  <p className="text-[12px] text-ink-muted">{formatDate(b.starts_at)}</p>
                </div>
                <StatusBadge
                  label={b.status}
                  tone={b.status === "completed" ? "positive" : "neutral"}
                />
              </Sheet>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Reviews Received</h2>
        {reviews === null && (
          <div className="flex flex-col gap-2">
            <BookingCardSkeleton />
          </div>
        )}
        {reviews && reviewsReceived.length === 0 && (
          <EmptyState icon={Star} title="No reviews yet" />
        )}
        {reviews && reviewsReceived.length > 0 && (
          <div className="flex flex-col gap-2">
            {reviewsReceived.map((r) => (
              <Sheet key={r.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{r.reviewerName}</p>
                  <Stars rating={r.rating} />
                </div>
                {r.comment && <p className="text-[13px] text-ink-muted">{r.comment}</p>}
                <p className="text-[11.5px] text-ink-muted">{formatDate(r.createdAt)}</p>
              </Sheet>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
