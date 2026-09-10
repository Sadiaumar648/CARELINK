"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Sheet } from "@/components/ui/sheet";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { RequestCareHero } from "@/components/parent/request-care-hero";
import {
  RequestFlowPanel,
  type RequestFlowInitial,
  type RequestFlowRestore,
} from "@/components/parent/request-flow-panel";
import { KIND_META, DEFAULT_KIND_META, TONE_CLASSES } from "@/lib/notification-kind-meta";
import { minutesAgoLabel } from "@/lib/relative-time";

type Notification = {
  id: string;
  kind: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type CaregiverType = "nanny" | "babysitter";

// The real, saved shape GET /api/care-requests/[id] returns — the
// "Request Care Again" retry flow's one authoritative source, never
// reconstructed from frontend-only state.
type CareRequestRecord = {
  ward_id: string | null;
  ward_ids: string[] | null;
  duration_days: number | null;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  service_address: string;
  service_latitude: number;
  service_longitude: number;
  location_place_id: string | null;
  location_source: "current_location" | "gps_address";
  skills: string[] | null;
  notes: string | null;
  repeat_mode: "once" | "weekly" | "custom";
  repeat_weekdays: string[];
  repeat_start_date: string | null;
  repeat_end_date: string | null;
};

function toRestore(cr: CareRequestRecord): RequestFlowRestore {
  return {
    wardId: cr.ward_id,
    wardIds: cr.ward_ids?.length ? cr.ward_ids : cr.ward_id ? [cr.ward_id] : [],
    durationDays: cr.duration_days ?? 1,
    date: cr.date,
    startTime: cr.start_time,
    endTime: cr.end_time,
    location: cr.location,
    serviceAddress: cr.service_address,
    serviceLatitude: cr.service_latitude,
    serviceLongitude: cr.service_longitude,
    locationPlaceId: cr.location_place_id,
    locationSource: cr.location_source,
    skills: cr.skills,
    notes: cr.notes,
    repeatMode: cr.repeat_mode,
    repeatWeekdays: cr.repeat_weekdays,
    repeatStartDate: cr.repeat_start_date,
    repeatEndDate: cr.repeat_end_date,
  };
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ParentDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [activePanel, setActivePanel] = useState<CaregiverType | null>(null);
  const [panelInitial, setPanelInitial] = useState<RequestFlowInitial | undefined>(undefined);
  const [panelRestore, setPanelRestore] = useState<RequestFlowRestore | undefined>(undefined);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ notifications: Notification[] }>("/api/notifications")
      .then((res) => {
        if (!cancelled) {
          setError(null);
          setNotifications(res.notifications.slice(0, 5));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  // A round trip from Find Care's "Edit your request" link ("We
  // couldn't find anyone — go change what you asked for") arrives here
  // with the same querystring the request flow originally built, so the
  // panel can reopen pre-filled rather than making the parent start over.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get("panel");
    if (panel !== "nanny" && panel !== "babysitter") return;
    // A synchronous external read (the URL), so the resulting state
    // updates are deferred out of the effect body itself.
    void Promise.resolve().then(() => {
      setActivePanel(panel);
      setPanelInitial({
        startDate: params.get("startDate") ?? undefined,
        schedule: params.get("schedule") ?? undefined,
        days: params.get("days") ?? undefined,
        hours: params.get("hours") ?? undefined,
        area: params.get("area") ?? undefined,
        age: params.get("age") ?? undefined,
        requirements: params.get("requirements") ?? undefined,
      });
    });
  }, []);

  // "Request Care Again" from the exhausted-dispatch screen arrives here
  // as ?retryCareRequestId=<id> — the care request itself, never a
  // panel type or field values in the URL, so the restored form always
  // reflects the real saved row (works after a refresh, a fresh visit
  // to the same link, or navigating away and back) rather than
  // something that could go stale or be tampered with in the address
  // bar. Opening this link only ever reads the record — nothing is
  // created until the parent submits the form with Find Care.
  //
  // Read via useSearchParams (synchronous once mounted, under the
  // Suspense boundary below) rather than the window.location.search
  // parse the older ?panel= round trip below still uses — that
  // distinction matters here specifically: it's what lets the render
  // gate below show a loading state instead of ever painting real Home
  // content first. The ?panel= flow has no such requirement, so it's
  // deliberately left as it was rather than changed for consistency's
  // own sake.
  const searchParams = useSearchParams();
  const retryCareRequestId = searchParams.get("retryCareRequestId");

  useEffect(() => {
    if (!retryCareRequestId) return;
    apiFetch<{ careRequest: CareRequestRecord & { caregiver_type: CaregiverType } }>(
      `/api/care-requests/${retryCareRequestId}`,
    )
      .then((res) => {
        setPanelInitial(undefined);
        setPanelRestore(toRestore(res.careRequest));
        setActivePanel(res.careRequest.caregiver_type);
        // The retry id has done its one job (fetching the record) —
        // strip it from the address bar now that the form is showing,
        // replacing (not pushing) this history entry so it reads as a
        // normal, clean /parent visit rather than "still retrying
        // request X". This is what makes the form's own Back to Home
        // (onBack below, unchanged) land on the real Home view instead
        // of re-triggering — or getting stuck re-triggering, since the
        // fetch effect above only ever runs once per id — this same
        // restoring state: with the id gone, retryCareRequestId reads
        // null on the next render, so restoringRetry is false and
        // setActivePanel(null) alone is enough.
        router.replace("/parent");
      })
      .catch((err) => {
        // Handled gracefully, not silently: the parent stays on the
        // normal Home view (never a blank or half-filled form standing
        // in for the real request) with a clear note that this specific
        // restore didn't work — they can still start a fresh request
        // from the cards below.
        setRestoreError(errorMessage(err));
      });
  }, [retryCareRequestId, router]);

  // True for exactly the window between the retry link landing here and
  // that fetch settling — real Home content (the greeting, the AI card,
  // Recent Activity) must never paint during it, only this loading
  // state, so "Request Care Again" reads as going straight to the form,
  // never through Home first.
  const restoringRetry = Boolean(retryCareRequestId) && !activePanel && !restoreError;

  function openPanel(type: CaregiverType) {
    setPanelInitial(undefined);
    setPanelRestore(undefined);
    setActivePanel(type);
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (activePanel) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <RequestFlowPanel
          type={activePanel}
          initial={panelInitial}
          restoreFrom={panelRestore}
          onBack={() => setActivePanel(null)}
        />
      </div>
    );
  }

  if (restoringRetry) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-6 pt-24 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-wisteria border-t-transparent" />
        <p className="text-[14px] text-ink-muted">Restoring your request…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-6 md:p-8">
      {/* GREETING */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold font-heading">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-[15px] text-ink-muted">
          Let&apos;s find the right care for your family.
        </p>
      </div>

      {restoreError && (
        <p className="rounded-[10px] border border-error/30 bg-error-tint px-3.5 py-2.5 text-[13px] text-error">
          We couldn&apos;t restore your previous request details ({restoreError}). Start a new
          request below instead.
        </p>
      )}

      {/* FIND CARE — the one real entry point into a request. A parent no
          longer chooses Nanny vs Babysitter up front; who to send the
          request to is chosen afterwards, from a real, nearby, verified
          list (request-flow-panel.tsx's own two-step flow). */}
      <RequestCareHero onClick={() => openPanel("nanny")} />

      {/* Nia now lives inside the request flow itself — on the "Choose a
          caregiver" step, a parent who isn't sure who to pick can ask
          her to recommend one from the real list on screen. There's no
          separate Nia entry point on Home any more. */}

      {/* RECENT ACTIVITY + SAFETY */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Sheet className="flex flex-col gap-3 border-[var(--color-lavender-border)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold font-heading text-ink">Recent Activity</h2>
            <Link
              href="/parent/notifications"
              className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              View all
            </Link>
          </div>

          {notifications === null && <p className="text-[13px] text-ink-muted">Loading…</p>}

          {notifications && notifications.length === 0 && (
            <EmptyState
              icon={ShieldCheck}
              title="No activity yet"
              description="Updates on your bookings and account will show up here."
            />
          )}

          {notifications && notifications.length > 0 && (
            <div className="flex flex-col divide-y divide-hairline">
              {notifications.map((n) => {
                const meta = KIND_META[n.kind] ?? DEFAULT_KIND_META;
                const Icon = meta.icon;
                return (
                  <div key={n.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[meta.tone]}`}
                    >
                      <Icon size={17} weight="fill" />
                    </span>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <p className="text-[13.5px] font-semibold text-ink">{meta.label}</p>
                      <p className="text-[12.5px] text-ink-muted">{n.body}</p>
                    </div>
                    <p className="shrink-0 text-[11.5px] text-ink-muted">
                      {minutesAgoLabel(n.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Sheet>

        <Sheet className="flex flex-col gap-3 border-[var(--color-lavender-border)]">
          <ShieldCheck size={22} weight="fill" className="text-ink" />
          <h2 className="text-[15px] font-semibold font-heading text-ink">CareLink Safety</h2>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            We verify all caregivers before they can accept a booking.
          </p>
          <LinkButton href="/parent/safety?from=home" className="justify-center">
            Learn about safety
          </LinkButton>
        </Sheet>
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary — same pattern already
// used by /parent/safety for the same reason.
export default function ParentDashboardPage() {
  return (
    <Suspense>
      <ParentDashboard />
    </Suspense>
  );
}
