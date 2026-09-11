"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, CalendarCheck, UsersFour } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { BookingCardSkeleton, Skeleton } from "@/components/ui/skeleton";

// "View Details" destination for the Parents directory — none existed
// before this (the page previously showed phone/email directly in the
// list). Reuses the existing GET /api/admin/parents and
// GET /api/admin/bookings routes, filtered client-side, the same
// pattern already used for the caregiver detail page — no new backend
// routes.

type ParentEntry = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  // Short-lived signed URL to the parent's own identity-verification
  // selfie (GET /api/admin/parents) — null once there's no submission
  // with a selfie still on file.
  photoUrl: string | null;
  accountStatus: string;
  verificationStatus: string;
  verificationMethod: "carelink" | "agency" | null;
  agencyReferenceId: string | null;
  existingAgencyUser: boolean;
  invitationStatus: "pending" | "claimed" | null;
  parentProfileId: string | null;
  bookingCount: number;
  area: string | null;
  createdAt: string;
};

type BookingRow = {
  id: string;
  reference: string;
  parent_profile_id: string;
  starts_at: string;
  status: string;
};

const VERIFICATION_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  unverified: "neutral",
  pending: "info",
  verified: "positive",
  rejected: "attention",
};

function verificationLabel(status: string, method: "carelink" | "agency" | null): string {
  if (status === "verified") return method === "agency" ? "Verified by Agency" : "Verified";
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

export default function AdminParentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [parent, setParent] = useState<ParentEntry | null | undefined>(undefined);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ parents: ParentEntry[] }>("/api/admin/parents")
      .then((res) => {
        setError(null);
        setParent(res.parents.find((p) => p.id === id) ?? null);
      })
      .catch((err) => setError(errorMessage(err)));

    apiFetch<{ bookings: BookingRow[] }>("/api/admin/bookings")
      .then((res) => setBookings(res.bookings))
      .catch(() => setBookings([]));
  }, [id, retryKey]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (parent === undefined) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (parent === null) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Link
          href="/admin/users"
          className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
        >
          <ArrowLeft size={16} /> Back to Parents
        </Link>
        <EmptyState icon={UsersFour} title="Parent not found" />
      </div>
    );
  }

  const careHistory = parent.parentProfileId
    ? (bookings ?? [])
        .filter((b) => b.parent_profile_id === parent.parentProfileId)
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin/users"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Parents
      </Link>

      <Sheet className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar photoUrl={parent.photoUrl} name={parent.fullName} size="md" />
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold font-heading text-ink">{parent.fullName}</h1>
            <p className="text-[13.5px] text-ink-muted">
              {parent.phone} · {parent.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Bookings
            </p>
            <p className="text-[14px] text-ink">{parent.bookingCount}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Joined
            </p>
            <p className="text-[14px] text-ink">{formatDate(parent.createdAt)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Area
            </p>
            <p className="text-[14px] text-ink">{parent.area ?? "Not set"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <StatusBadge
            label={verificationLabel(parent.verificationStatus, parent.verificationMethod)}
            tone={VERIFICATION_TONE[parent.verificationStatus] ?? "neutral"}
          />
          <StatusBadge
            label={parent.existingAgencyUser ? "Existing agency parent" : "New parent"}
            tone="neutral"
          />
          {parent.agencyReferenceId && (
            <span className="text-[12.5px] text-ink-muted">
              Agency ref: {parent.agencyReferenceId}
            </span>
          )}
          {parent.invitationStatus === "pending" && (
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
    </div>
  );
}
