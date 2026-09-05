"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Star, WarningCircle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin's "View Reviews" — the central place reviews are seen and
// moderated. Today CareLink's reviews table only supports a parent's
// review of a caregiver (see reviews.rating's insert policy, migration
// 20260827200000_messaging_reviews_reports.sql) — a caregiver's review
// of a parent doesn't exist in the schema. Rather than fabricate that
// second direction, this page shows exactly what's real and says so;
// building genuine caregiver→parent reviews needs a deliberate schema
// change (a nullable rating column, or a new staff_rating column, plus
// a widened insert policy) that hasn't been made.

type ReviewRow = {
  id: string;
  direction: "parent_to_caregiver";
  rating: number;
  comment: string | null;
  staffResponse: string | null;
  hiddenByAdmin: boolean;
  hiddenReason: string | null;
  createdAt: string;
  bookingReference: string | null;
  reviewerName: string;
  reviewedName: string;
  reviewedUserId: string | null;
  reviewedAccountStatus: string | null;
  flagged: boolean;
};

type FlaggedAccount = {
  staffProfileId: string;
  userId: string | null;
  fullName: string;
  accountStatus: string | null;
  poorReviewCount: number;
};

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
          size={14}
          weight={n <= rating ? "fill" : "regular"}
          className={n <= rating ? "text-gold" : "text-ink-muted/40"}
        />
      ))}
    </span>
  );
}

function FlaggedAccountCard({
  account,
  onChanged,
}: {
  account: FlaggedAccount;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspended = account.accountStatus === "suspended";

  async function setStatus(status: "active" | "suspended") {
    if (!account.userId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${account.userId}/status`, {
        method: "PATCH",
        body: { accountStatus: status },
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet className="flex items-center justify-between gap-4 border-error/40 bg-error-tint">
      <div>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          <WarningCircle size={17} weight="fill" className="text-error" />
          {account.fullName}
        </p>
        <p className="text-[12.5px] text-ink-muted">
          {account.poorReviewCount} poor reviews (1–2★) · currently{" "}
          {account.accountStatus ?? "unknown"}
        </p>
        {error && <p className="text-[12.5px] text-error">{error}</p>}
      </div>
      <Button
        variant={suspended ? "secondary" : "danger"}
        disabled={busy || !account.userId}
        onClick={() => void setStatus(suspended ? "active" : "suspended")}
      >
        {busy ? "Saving…" : suspended ? "Reactivate account" : "Suspend account"}
      </Button>
    </Sheet>
  );
}

function ReviewCard({ review, onChanged }: { review: ReviewRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleHidden() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        body: review.hiddenByAdmin
          ? { hidden: false }
          : { hidden: true, hiddenReason: "Hidden by admin" },
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-ink">
            {review.reviewerName} <span className="font-normal text-ink-muted">reviewed</span>{" "}
            {review.reviewedName}
          </p>
          <p className="text-[12px] text-ink-muted">
            {review.bookingReference ? `${review.bookingReference} · ` : ""}
            {formatDate(review.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review.flagged && <StatusBadge label="Account flagged" tone="attention" />}
          {review.hiddenByAdmin && <StatusBadge label="Hidden" tone="neutral" />}
          <Stars rating={review.rating} />
        </div>
      </div>
      {review.comment && <p className="text-[13.5px] leading-relaxed text-ink">{review.comment}</p>}
      {review.staffResponse && (
        <p className="rounded-[10px] bg-wisteria-tint px-3 py-2 text-[13px] text-ink">
          <span className="font-semibold">Caregiver response: </span>
          {review.staffResponse}
        </p>
      )}
      {error && <p className="text-[12.5px] text-error">{error}</p>}
      <Button variant="secondary" disabled={busy} onClick={() => void toggleHidden()}>
        {busy ? "Saving…" : review.hiddenByAdmin ? "Unhide review" : "Hide review"}
      </Button>
    </Sheet>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [flaggedAccounts, setFlaggedAccounts] = useState<FlaggedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function load() {
    apiFetch<{ reviews: ReviewRow[]; flaggedAccounts: FlaggedAccount[] }>("/api/admin/reviews")
      .then((res) => {
        setError(null);
        setReviews(res.reviews);
        setFlaggedAccounts(res.flaggedAccounts);
      })
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [retryKey]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Reviews</h1>
        <p className="text-[14px] text-ink-muted">
          Reviews parents have submitted about caregivers after completed bookings.
        </p>
      </div>

      <p className="rounded-[10px] border border-hairline bg-sheet px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
        CareLink currently supports parent reviews of caregivers. Caregivers reviewing parents
        isn&apos;t available yet — it would need a deliberate change to the review schema, not
        something to add silently here.
      </p>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && flaggedAccounts === null && (
        <div className="flex flex-col gap-3">
          <BookingCardSkeleton />
        </div>
      )}

      {!error && flaggedAccounts && flaggedAccounts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Accounts needing attention</h2>
          <p className="text-[12.5px] text-ink-muted">
            More than 2 poor (1–2★) reviews. Review each account and decide whether action is
            necessary — nothing is suspended automatically.
          </p>
          <div className="flex flex-col gap-3">
            {flaggedAccounts.map((a) => (
              <FlaggedAccountCard key={a.staffProfileId} account={a} onChanged={load} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">All Reviews</h2>
          <Link
            href="/admin/reports"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
          >
            <Flag size={14} /> Safety reports
          </Link>
        </div>

        {!error && reviews === null && (
          <div className="flex flex-col gap-3">
            <BookingCardSkeleton />
            <BookingCardSkeleton />
          </div>
        )}

        {!error && reviews?.length === 0 && (
          <EmptyState
            icon={Star}
            title="No reviews yet"
            description="Reviews will appear here once parents complete bookings and rate their caregiver."
          />
        )}

        {!error && reviews && reviews.length > 0 && (
          <div className="flex flex-col gap-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onChanged={load} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
