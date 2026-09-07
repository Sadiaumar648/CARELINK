"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star, WarningCircle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton } from "@/components/ui/skeleton";

// Admin's "View Reviews" — real reviews from both directions:
// public.reviews (parent -> caregiver) and public.caregiver_reviews
// (caregiver -> parent, migration 20260913000000_caregiver_reviews.sql).
// Both are read from GET /api/admin/reviews, which merges and tags each
// row with its real `direction` — nothing here is fabricated.

type Direction = "parent_to_caregiver" | "caregiver_to_parent";

type ReviewRow = {
  id: string;
  direction: Direction;
  rating: number;
  comment: string | null;
  responseText: string | null;
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
  role: "caregiver" | "parent";
  profileId: string;
  userId: string | null;
  fullName: string;
  accountStatus: string | null;
  poorReviewCount: number;
};

const DIRECTION_LABEL: Record<Direction, string> = {
  parent_to_caregiver: "Parent review",
  caregiver_to_parent: "Caregiver review",
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
          <StatusBadge
            label={account.role === "caregiver" ? "Caregiver" : "Parent"}
            tone="neutral"
          />
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
          ? { hidden: false, direction: review.direction }
          : { hidden: true, hiddenReason: "Hidden by admin", direction: review.direction },
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
          <StatusBadge
            label={DIRECTION_LABEL[review.direction]}
            tone={review.direction === "parent_to_caregiver" ? "info" : "positive"}
          />
          {review.flagged && <StatusBadge label="Needs review" tone="attention" />}
          {review.hiddenByAdmin && <StatusBadge label="Hidden" tone="neutral" />}
          <Stars rating={review.rating} />
        </div>
      </div>
      {review.comment && <p className="text-[13.5px] leading-relaxed text-ink">{review.comment}</p>}
      {review.responseText && (
        <p className="rounded-[10px] bg-wisteria-tint px-3 py-2 text-[13px] text-ink">
          <span className="font-semibold">Caregiver response: </span>
          {review.responseText}
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
  const [direction, setDirection] = useState<"all" | Direction>("all");
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

  const filtered = reviews?.filter((r) => direction === "all" || r.direction === direction) ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Reviews</h1>
        <p className="text-[14px] text-ink-muted">Monitor feedback from parents and caregivers.</p>
      </div>

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
              <FlaggedAccountCard key={`${a.role}-${a.profileId}`} account={a} onChanged={load} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "all", label: "All" },
              { key: "parent_to_caregiver", label: "Parent reviews" },
              { key: "caregiver_to_parent", label: "Caregiver reviews" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setDirection(f.key)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
                direction === f.key
                  ? "bg-wisteria text-sheet"
                  : "border border-hairline bg-sheet text-ink-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!error && reviews === null && (
          <div className="flex flex-col gap-3">
            <BookingCardSkeleton />
            <BookingCardSkeleton />
          </div>
        )}

        {!error && filtered?.length === 0 && (
          <EmptyState
            icon={Star}
            tone="bluebell"
            title="No reviews yet"
            description="Reviews will appear here after completed care bookings are rated by parents and caregivers."
          />
        )}

        {!error && filtered && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((r) => (
              <ReviewCard key={`${r.direction}-${r.id}`} review={r} onChanged={load} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
