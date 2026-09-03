"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Sparkle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Sheet } from "@/components/ui/sheet";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { CareTypeCard } from "@/components/parent/care-type-card";
import { RequestFlowPanel, type RequestFlowInitial } from "@/components/parent/request-flow-panel";
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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function ParentDashboardPage() {
  const { user } = useAuth();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [activePanel, setActivePanel] = useState<CaregiverType | null>(null);
  const [panelInitial, setPanelInitial] = useState<RequestFlowInitial | undefined>(undefined);

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

  function openPanel(type: CaregiverType) {
    setPanelInitial(undefined);
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
          onBack={() => setActivePanel(null)}
        />
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

      {/* CARELINK AI — for a parent who isn't sure which service type they
          need. Advisory only: it never picks, searches for, or books a
          caregiver — it only recommends Nanny or Babysitter, then hands
          off to the same structured request flow the direct cards below
          use. Matching and dispatch happen only after that request. */}
      <Sheet className="flex flex-col gap-4 border-[var(--color-lavender-border)] bg-wisteria-tint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sheet text-wisteria shadow-[var(--shadow-card)]">
            <Sparkle size={20} weight="fill" />
          </span>
          <div>
            <p className="text-[17px] font-bold font-heading text-ink">CareLink AI</p>
            <p className="text-[14px] font-semibold text-ink">
              Not sure what type of care you need?
            </p>
            <p className="text-[13.5px] text-ink-muted">
              Tell us about your situation and we&apos;ll help you decide between a Nanny or
              Babysitter.
            </p>
          </div>
        </div>
        <LinkButton href="/parent/care-ai" className="w-full shrink-0 justify-center sm:w-auto">
          Start with CareLink AI
        </LinkButton>
      </Sheet>

      {/* CARE TYPE SELECTION — secondary/direct path, for a parent who
          already knows what they need. Two fully independent cards, not
          nested inside a combined wrapper card. */}
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-muted">Already know what you need?</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <CareTypeCard
            title="Nanny"
            description="Long-term care and daily support"
            imageSrc="/demo/hero-reading.jpeg"
            imageAlt="A nanny reading with a child"
            onClick={() => openPanel("nanny")}
          />
          <CareTypeCard
            title="Babysitter"
            description="Short-term care and occasional support"
            imageSrc="/demo/ward-activity.jpeg"
            imageAlt="A babysitter playing with a child"
            onClick={() => openPanel("babysitter")}
          />
        </div>
      </div>

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
