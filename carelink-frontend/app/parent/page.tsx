"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MagnifyingGlass, Baby, CalendarCheck, ChatCircle, Plus } from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { VerificationBadge } from "@/components/ui/badge";
import { CaregiverCard } from "@/components/ui/caregiver-card";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import {
  WardCardSkeleton,
  CaregiverCardSkeleton,
  BookingCardSkeleton,
} from "@/components/ui/skeleton";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { parseWardGeneralNotes, CARE_STAGE_LABELS } from "@/lib/ward-notes";

type Household = { area: string } | null;

type Ward = {
  id: string;
  display_name: string;
  age_years: number;
  general_notes: string | null;
};

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  address: string;
  status: string;
  staff_profile_id: string;
};

type CaregiverBrief = {
  staff_profile_id: string;
  full_name: string;
  photo_path: string | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
};

type CaregiverResult = CaregiverBrief & {
  matchScore: number;
  areas: { area: string; isPrimary: boolean }[];
};

type Notification = { id: string; body: string; read_at: string | null; created_at: string };

const BOOKING_TONE: Record<string, "neutral" | "positive" | "attention" | "info"> = {
  pending: "info",
  accepted: "neutral",
  paid: "positive",
  active: "positive",
  completed: "positive",
  declined: "attention",
  cancelled: "attention",
};

const UPCOMING_STATUSES = new Set(["pending", "accepted", "paid", "active"]);

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time(start)}–${time(end)}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  const [query, setQuery] = useState("");

  const [household, setHousehold] = useState<Household | undefined>(undefined);
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [upcomingCaregiver, setUpcomingCaregiver] = useState<CaregiverBrief | null>(null);
  const [recommended, setRecommended] = useState<CaregiverResult[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function retry() {
    setCriticalError(null);
    setHousehold(undefined);
    setWards(null);
    setBookings(null);
    setUpcomingCaregiver(null);
    setRecommended(null);
    setNotifications(null);
    setRetryKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;

    apiFetch<{ household: Household }>("/api/parents/household")
      .then((res) => {
        if (cancelled) return;
        setHousehold(res.household);

        apiFetch<{ wards: Ward[] }>("/api/wards")
          .then((r) => {
            if (!cancelled) setWards(r.wards);
          })
          .catch((err) => {
            if (cancelled) return;
            if (err instanceof ApiError && err.status === 400) setWards([]);
            else setWards([]);
          });

        const area = res.household?.area;
        apiFetch<{ results: CaregiverResult[] }>(
          `/api/search/caregivers${area ? `?area=${encodeURIComponent(area)}` : ""}`,
        )
          .then((r) => {
            if (!cancelled) setRecommended(r.results.slice(0, 4));
          })
          .catch(() => {
            if (!cancelled) setRecommended([]);
          });
      })
      .catch((err) => {
        if (!cancelled) setCriticalError(errorMessage(err));
      });

    apiFetch<{ bookings: Booking[] }>("/api/bookings")
      .then((res) => {
        if (cancelled) return;
        setBookings(res.bookings);
        const upcoming = res.bookings
          .filter((b) => UPCOMING_STATUSES.has(b.status))
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
        if (upcoming) {
          apiFetch<{ caregiver: CaregiverBrief }>(`/api/caregivers/${upcoming.staff_profile_id}`)
            .then((r) => {
              if (!cancelled) setUpcomingCaregiver(r.caregiver);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
      });

    apiFetch<{ notifications: Notification[] }>("/api/notifications")
      .then((res) => {
        if (!cancelled) setNotifications(res.notifications.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/parent/find-care?q=${encodeURIComponent(query.trim())}`);
  }

  const upcoming = bookings
    ?.filter((b) => UPCOMING_STATUSES.has(b.status))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  const isBrandNew =
    wards !== null && wards.length === 0 && bookings !== null && bookings.length === 0;
  const topPick = recommended?.[0];

  if (criticalError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <ErrorState onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋🏾
        </h1>
        <p className="text-[15px] text-ink-muted">What kind of care do you need today?</p>
      </div>

      {/* PRIMARY SEARCH */}
      <Sheet as="form" onSubmit={onSearchSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Field
            label="Describe the care you need"
            placeholder="I need a babysitter this Saturday from 9am to 4pm for my 4-year-old…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" className="sm:mt-[26px]">
          <MagnifyingGlass size={18} /> Find Care →
        </Button>
      </Sheet>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/parent/find-care", icon: MagnifyingGlass, label: "Find Care" },
          { href: "/parent/children", icon: Baby, label: "Add Ward" },
          { href: "/parent/bookings", icon: CalendarCheck, label: "Bookings" },
          { href: "/parent/messages", icon: ChatCircle, label: "Messages" },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-[14px] border border-hairline bg-sheet px-3 py-4 text-center hover:border-sage/50"
          >
            <action.icon size={22} className="text-sage" />
            <span className="text-[12.5px] font-semibold text-ink">{action.label}</span>
          </Link>
        ))}
      </div>

      {isBrandNew && (
        <Sheet className="flex flex-col items-center gap-4 text-center">
          <p className="text-[19px] font-semibold font-heading">Welcome to CareLink 👋🏾</p>
          <p className="max-w-sm text-[14px] text-ink-muted">
            Let&apos;s start by telling us who you&apos;re looking for care for.
          </p>
          <Link href="/parent/children">
            <Button>
              <Plus size={16} /> Create Ward Profile
            </Button>
          </Link>
          <div className="w-full border-t border-hairline pt-4">
            <p className="text-[14px] text-ink-muted">Ready to find care?</p>
            <Link
              href="/parent/find-care"
              className="font-semibold text-sage hover:text-sage-hover"
            >
              Find a Caregiver →
            </Link>
          </div>
        </Sheet>
      )}

      {/* WARD PROFILES */}
      {!isBrandNew && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[19px] font-semibold font-heading">Your Ward Profiles</h2>
              <p className="text-[13px] text-ink-muted">
                Keep your children&apos;s care information organized in one place.
              </p>
            </div>
            <Link
              href="/parent/children"
              className="text-[13px] font-semibold text-sage hover:text-sage-hover"
            >
              View all
            </Link>
          </div>

          {wards === null && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WardCardSkeleton />
              <WardCardSkeleton />
            </div>
          )}

          {wards && wards.length === 0 && (
            <EmptyState
              icon={Baby}
              title="No ward profiles yet"
              description="Add a child so CareLink can help you find suitable care."
              action={
                <Link href="/parent/children">
                  <Button size="default">
                    <Plus size={16} /> Add Ward Profile
                  </Button>
                </Link>
              }
            />
          )}

          {wards && wards.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {wards.slice(0, 4).map((w) => {
                const parsed = parseWardGeneralNotes(w.general_notes);
                const stageLabel = parsed.careStage
                  ? (CARE_STAGE_LABELS[parsed.careStage] ?? parsed.careStage)
                  : null;
                return (
                  <Sheet key={w.id} className="flex flex-col gap-3">
                    <div>
                      <p className="text-[17px] font-semibold font-heading">{w.display_name}</p>
                      <p className="text-[13px] text-ink-muted">
                        {w.age_years} years old{stageLabel ? ` · ${stageLabel}` : ""}
                      </p>
                    </div>
                    {parsed.careNeeds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {parsed.careNeeds.slice(0, 3).map((need) => (
                          <span
                            key={need}
                            className="rounded-full bg-sage-tint px-2.5 py-1 text-[11.5px] text-sage-pressed"
                          >
                            {need}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-4 border-t border-hairline pt-3 text-[13px] font-semibold">
                      <Link
                        href={`/parent/children/${w.id}`}
                        className="text-sage hover:text-sage-hover"
                      >
                        View Profile
                      </Link>
                      <Link
                        href={`/parent/children/${w.id}?edit=1`}
                        className="text-ink-muted hover:text-ink"
                      >
                        Edit
                      </Link>
                    </div>
                  </Sheet>
                );
              })}
              <Link
                href="/parent/children"
                className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-hairline p-5 text-center hover:border-sage/50"
              >
                <Plus size={20} className="text-sage" />
                <span className="text-[13px] font-semibold text-ink">Add Ward Profile</span>
              </Link>
            </div>
          )}
        </section>
      )}

      {/* UPCOMING BOOKING */}
      {!isBrandNew && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[19px] font-semibold font-heading">Upcoming Booking</h2>

          {bookings === null && <BookingCardSkeleton />}

          {bookings !== null && !upcoming && (
            <EmptyState
              icon={CalendarCheck}
              title="No upcoming bookings"
              description="Find a caregiver when you're ready."
              action={
                <Link href="/parent/find-care">
                  <Button size="default">Find Care →</Button>
                </Link>
              }
            />
          )}

          {upcoming && (
            <Link href={`/parent/bookings/${upcoming.id}`}>
              <Sheet className="flex items-center justify-between gap-4 hover:border-sage/50">
                <div className="flex items-center gap-4">
                  <Avatar
                    photoUrl={caregiverPhotoUrl(upcomingCaregiver?.photo_path)}
                    name={upcomingCaregiver?.full_name ?? "Caregiver"}
                    size="md"
                  />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[16px] font-semibold">
                        {upcomingCaregiver?.full_name ?? "Caregiver"}
                      </p>
                      {upcomingCaregiver && <VerificationBadge />}
                    </div>
                    <p className="text-[13px] text-ink-muted">
                      {formatRange(upcoming.starts_at, upcoming.ends_at)}
                    </p>
                    <p className="text-[13px] text-ink-muted">{upcoming.address}</p>
                  </div>
                </div>
                <StatusBadge
                  label={upcoming.status}
                  tone={BOOKING_TONE[upcoming.status] ?? "neutral"}
                />
              </Sheet>
            </Link>
          )}
        </section>
      )}

      {/* RECOMMENDED CAREGIVERS */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[19px] font-semibold font-heading">Recommended for you</h2>
          <p className="text-[13px] text-ink-muted">
            {household?.area
              ? `Based on caregivers near ${household.area}.`
              : "Based on your care preferences."}
          </p>
        </div>

        {recommended === null && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CaregiverCardSkeleton />
            <CaregiverCardSkeleton />
          </div>
        )}

        {recommended && recommended.length === 0 && (
          <p className="text-[13px] text-ink-muted">No caregivers on the roster yet.</p>
        )}

        {recommended && recommended.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recommended.map((c) => {
              const primaryArea = c.areas?.find((a) => a.isPrimary)?.area ?? null;
              return (
                <CaregiverCard
                  key={c.staff_profile_id}
                  href={`/parent/caregivers/${c.staff_profile_id}`}
                  photoUrl={caregiverPhotoUrl(c.photo_path)}
                  name={c.full_name}
                  verified
                  yearsExperience={c.years_experience}
                  area={primaryArea}
                  hourlyRate={c.hourly_rate}
                  ratingAvg={c.rating_avg}
                  ratingCount={c.rating_count}
                  skills={c.skills}
                  matchScore={c.matchScore}
                />
              );
            })}
          </div>
        )}

        {topPick && (
          <Sheet className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-ink">
              Why we recommend {topPick.full_name.split(" ")[0]}
            </p>
            <ul className="flex flex-col gap-1 text-[13px] text-ink-muted">
              {household?.area &&
                topPick.areas?.some(
                  (a) => a.area.trim().toLowerCase() === household.area.trim().toLowerCase(),
                ) && <li>✓ Works in your area</li>}
              {topPick.rating_count > 0 && topPick.rating_avg && topPick.rating_avg >= 4.5 && (
                <li>
                  ✓ Highly rated — {topPick.rating_avg.toFixed(1)} stars ({topPick.rating_count}{" "}
                  reviews)
                </li>
              )}
              {(topPick.years_experience ?? 0) >= 3 && (
                <li>✓ {topPick.years_experience} years of experience</li>
              )}
            </ul>
          </Sheet>
        )}
      </section>

      {/* RECENT ACTIVITY */}
      {notifications && notifications.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[19px] font-semibold font-heading">Recent Activity</h2>
          <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-sheet shadow-[var(--shadow-card)]">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <p className="text-[13px] text-ink">{n.body}</p>
                <p className="shrink-0 text-[12px] text-ink-muted">{timeAgo(n.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
