"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  DotsThreeVertical,
  Link as LinkIcon,
  ShareNetwork,
  WarningCircle,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// "Generate Caregiver Onboarding Link" — now wired to a real backend
// (migration 20260914000000_caregiver_onboarding_links.sql,
// GET/POST /api/admin/onboarding-links, PATCH .../[id]). "Agency" stays
// a static label: CareLink is a single agency's platform, not
// multi-tenant, so there's no per-admin agency record to fetch — this
// isn't a fabricated value, just not a queried one.
//
// The generated URL's actual destination — a public
// /caregiver/join/[token] self-registration page — does not exist yet
// (a separate, larger, not-yet-approved piece of work). Links are
// genuinely created, listed, and deactivated for real; the honest
// caveat about where they point is shown, not hidden.

type OnboardingLink = {
  id: string;
  token: string;
  label: string;
  maxRegistrations: number;
  registrationCount: number;
  expiresAt: string | null;
  status: "Active" | "Deactivated" | "Expired" | "Limit reached";
  createdAt: string;
};

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "none", label: "No expiry" },
] as const;

const STATUS_TONE: Record<OnboardingLink["status"], "neutral" | "positive" | "attention" | "info"> =
  {
    Active: "positive",
    Deactivated: "neutral",
    Expired: "attention",
    "Limit reached": "attention",
  };

function formatDate(iso: string | null): string {
  if (!iso) return "No expiry";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shareUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/caregiver/join/${token}`;
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
      >
        {children}
      </select>
    </div>
  );
}

function CopyButton({ text, label = "Copy Link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <>
          <Check size={15} /> Copied
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function GeneratedLinkCard({
  link,
  onDeactivated,
}: {
  link: OnboardingLink;
  onDeactivated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = shareUrl(link.token);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function deactivate() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/onboarding-links/${link.id}`, {
        method: "PATCH",
        body: { action: "deactivate" },
      });
      onDeactivated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet className="flex flex-col gap-4 border-[var(--color-success)]/40 bg-success-tint">
      <h2 className="text-[15px] font-semibold text-ink">Your onboarding link is ready</h2>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13.5px] text-ink"
      />
      <div className="flex flex-wrap gap-3">
        <CopyButton text={url} />
        {canShare && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void navigator.share({ title: "CareLink caregiver onboarding", url }).catch(() => {})
            }
          >
            <ShareNetwork size={15} /> Share
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-hairline pt-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Status
          </p>
          <StatusBadge label={link.status} tone={STATUS_TONE[link.status]} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Registrations
          </p>
          <p className="text-[14px] text-ink">
            {link.registrationCount} / {link.maxRegistrations}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Expires
          </p>
          <p className="text-[14px] text-ink">{formatDate(link.expiresAt)}</p>
        </div>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      {link.status === "Active" && (
        <Button type="button" variant="danger" disabled={busy} onClick={() => void deactivate()}>
          {busy ? "Deactivating…" : "Deactivate Link"}
        </Button>
      )}
    </Sheet>
  );
}

function LinkRowMenu({ link, onChanged }: { link: OnboardingLink; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function deactivate() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/onboarding-links/${link.id}`, {
        method: "PATCH",
        body: { action: "deactivate" },
      });
      onChanged();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-ink-muted hover:bg-wisteria-tint hover:text-wisteria"
      >
        <DotsThreeVertical size={16} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-[12px] border border-hairline bg-sheet py-1 shadow-[var(--shadow-card-hover)]">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl(link.token));
              setOpen(false);
            }}
            className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-ink hover:bg-wisteria-tint"
          >
            Copy link
          </button>
          {link.status !== "Deactivated" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deactivate()}
              className="flex w-full items-center px-3.5 py-2 text-left text-[13px] text-error hover:bg-error-tint"
            >
              {busy ? "Deactivating…" : "Deactivate"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminOnboardingLinkPage() {
  const [expiry, setExpiry] = useState("30");
  const [maxRegistrations, setMaxRegistrations] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<OnboardingLink | null>(null);

  const [links, setLinks] = useState<OnboardingLink[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  function loadLinks() {
    apiFetch<{ links: OnboardingLink[] }>("/api/admin/onboarding-links")
      .then((res) => {
        setListError(null);
        setLinks(res.links);
      })
      .catch((err) => setListError(errorMessage(err)));
  }

  useEffect(loadLinks, [retryKey]);

  async function onGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await apiFetch<{ link: OnboardingLink }>("/api/admin/onboarding-links", {
        method: "POST",
        body: { expiryDays: expiry === "none" ? null : Number(expiry), maxRegistrations },
      });
      setJustGenerated(res.link);
      loadLinks();
    } catch (err) {
      setGenerateError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/admin"
        className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-wisteria"
      >
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">
          Generate Caregiver Onboarding Link
        </h1>
        <p className="text-[14px] text-ink-muted">
          Create a secure registration link for your agency caregivers.
        </p>
      </div>

      <p className="flex items-start gap-1.5 rounded-[10px] border border-hairline bg-sheet px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
        <WarningCircle size={15} className="mt-0.5 shrink-0 text-gold" />
        Links generated here are real and manageable, but the caregiver-facing registration page
        they point to hasn&apos;t been built yet — sharing a link won&apos;t let anyone register
        until that exists.
      </p>

      <Sheet className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bluebell-tint text-[var(--color-bluebell-pressed)]">
            <LinkIcon size={19} />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold text-ink">Create onboarding link</h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Generate a secure link that you can share with your agency caregivers. Each caregiver
              will use the link to create their own account and complete their registration.
            </p>
          </div>
        </div>

        <Field label="Agency" value="CareLink Agency" readOnly disabled />
        <p className="-mt-4 text-[12.5px] text-ink-muted">
          Caregivers registering through this link will be associated with your agency.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Link expiry" value={expiry} onChange={setExpiry}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col gap-2">
            <Field
              label="Maximum registrations"
              type="number"
              min={1}
              max={10000}
              value={maxRegistrations}
              onChange={(e) => setMaxRegistrations(Number(e.target.value))}
            />
            <p className="text-[12.5px] text-ink-muted">
              The link can be used until the registration limit is reached.
            </p>
          </div>
        </div>

        {generateError && <p className="text-[13px] text-error">{generateError}</p>}

        <Button
          type="button"
          disabled={generating}
          onClick={() => void onGenerate()}
          className="w-fit"
        >
          {generating ? "Generating…" : "Generate Link"}
        </Button>
      </Sheet>

      {justGenerated && (
        <GeneratedLinkCard
          link={justGenerated}
          onDeactivated={() => {
            setJustGenerated(null);
            loadLinks();
          }}
        />
      )}

      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bluebell-tint text-[var(--color-bluebell-pressed)]">
          <LinkIcon size={19} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-semibold text-ink">Active onboarding links</h2>
          <p className="text-[13px] text-ink-muted">
            View and manage your existing onboarding links.
          </p>
        </div>
      </div>

      {listError && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!listError && links === null && (
        <Sheet>
          <Skeleton className="h-24 w-full" />
        </Sheet>
      )}

      {!listError && links?.length === 0 && (
        <Sheet>
          <EmptyState
            icon={LinkIcon}
            title="No active onboarding links"
            description="Generate a link to begin onboarding your agency caregivers."
          />
        </Sheet>
      )}

      {!listError && links && links.length > 0 && (
        <div className="overflow-x-auto rounded-[16px] border border-hairline bg-sheet">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Link</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Created</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Registrations</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Expires</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Status</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{l.label}</p>
                    <p className="text-[12px] text-ink-muted">{shareUrl(l.token)}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {formatDate(l.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {l.registrationCount} / {l.maxRegistrations}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {formatDate(l.expiresAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge label={l.status} tone={STATUS_TONE[l.status]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <LinkRowMenu link={l} onChanged={loadLinks} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
