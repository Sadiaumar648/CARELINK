"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, DeviceMobile, TrashSimple } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

type Network = "mtn" | "telecel" | "airteltigo";

// Matches the exact set booking-detail.tsx's real PaymentForm already
// offers when paying for a booking — this page only manages a saved
// list for convenience, it never processes anything itself.
const NETWORKS: { value: Network; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "telecel", label: "Telecel Cash" },
  { value: "airteltigo", label: "AirtelTigo Money" },
];

type SavedMethod = { id: string; network: Network; phoneNumber: string; isDefault: boolean };

// There is no saved-payment-method table in the backend — every real
// booking payment (booking-detail.tsx's PaymentForm, untouched by this
// page) asks fresh for a network and number each time, which is exactly
// what keeps working. This page is a device-only convenience list, kept
// in this browser's localStorage and scoped to the signed-in user's id
// so switching accounts on the same device doesn't mix up saved
// numbers. It never talks to the backend and is never read by the real
// payment form, so there's nothing here that could make it look like a
// transaction happened.
function storageKey(userId: string) {
  return `carelink-payment-methods-${userId}`;
}

function loadMethods(userId: string): SavedMethod[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as SavedMethod[]) : [];
  } catch {
    return [];
  }
}

function saveMethods(userId: string, methods: SavedMethod[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(methods));
  } catch {
    // Private browsing / storage disabled — the list just won't persist.
  }
}

export default function PaymentMethodsPage() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<SavedMethod[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [network, setNetwork] = useState<Network>("mtn");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    // localStorage is a synchronous external system, but the read is
    // deferred to a microtask so the setState isn't called directly in
    // the effect body itself — same reasoning as deferring a fetch's
    // .then() callback, just without an actual async gap to wait on.
    Promise.resolve().then(() => setMethods(loadMethods(userId)));
  }, [user?.id]);

  function persist(next: SavedMethod[]) {
    setMethods(next);
    if (user?.id) saveMethods(user.id, next);
  }

  function addMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[0-9+\s-]{9,}$/.test(phoneNumber.trim())) {
      setError("Enter a valid Mobile Money number.");
      return;
    }
    const next: SavedMethod = {
      id: `${Date.now()}`,
      network,
      phoneNumber: phoneNumber.trim(),
      isDefault: (methods?.length ?? 0) === 0,
    };
    persist([...(methods ?? []), next]);
    setPhoneNumber("");
    setError(null);
    setAdding(false);
  }

  function setDefault(id: string) {
    persist((methods ?? []).map((m) => ({ ...m, isDefault: m.id === id })));
  }

  function remove(id: string) {
    const remaining = (methods ?? []).filter((m) => m.id !== id);
    if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
      remaining[0].isDefault = true;
    }
    persist(remaining);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Settings
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Payment Methods</h1>
        <p className="text-[14px] text-ink-muted">
          Save a Mobile Money number for faster checkout. This list is stored on this device only —
          you&apos;ll still confirm the network and number each time you pay for a booking.
        </p>
      </div>

      {methods === null && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {methods && methods.length === 0 && !adding && (
        <Sheet className="flex flex-col items-center gap-3 py-10 text-center">
          <DeviceMobile size={32} className="text-ink-muted" />
          <p className="text-[15px] font-semibold text-ink">No saved payment methods</p>
          <p className="text-[13px] text-ink-muted">Add a Mobile Money number to save it here.</p>
          <Button onClick={() => setAdding(true)}>Add Payment Method</Button>
        </Sheet>
      )}

      {methods && methods.length > 0 && (
        <div className="flex flex-col gap-3">
          {methods.map((m) => (
            <Sheet key={m.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
                  <DeviceMobile size={20} weight="duotone" />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {NETWORKS.find((n) => n.value === m.network)?.label}
                  </p>
                  <p className="text-[13px] text-ink-muted">{m.phoneNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {m.isDefault ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-wisteria">
                    <CheckCircle size={14} weight="fill" /> Default
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDefault(m.id)}
                    className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  aria-label="Remove payment method"
                  className="text-ink-muted hover:text-error"
                >
                  <TrashSimple size={18} />
                </button>
              </div>
            </Sheet>
          ))}
        </div>
      )}

      {methods && methods.length > 0 && !adding && (
        <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
          Add Another Payment Method
        </Button>
      )}

      {adding && (
        <Sheet as="form" onSubmit={addMethod} className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold font-heading">Add a Mobile Money number</h2>
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Network
            </span>
            <div className="flex flex-col gap-2">
              {NETWORKS.map((n) => (
                <label
                  key={n.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 text-[14px] ${
                    network === n.value ? "border-wisteria bg-wisteria-tint" : "border-hairline"
                  }`}
                >
                  <input
                    type="radio"
                    name="network"
                    checked={network === n.value}
                    onChange={() => setNetwork(n.value)}
                  />
                  {n.label}
                </label>
              ))}
            </div>
          </div>
          <Field
            label="Mobile money number"
            type="tel"
            placeholder="0XX XXX XXXX"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          {error && <p className="text-[13px] text-error">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit">Save Payment Method</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAdding(false);
                setError(null);
                setPhoneNumber("");
              }}
            >
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
