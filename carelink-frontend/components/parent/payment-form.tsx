"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

export type Payment = {
  id: string;
  status: "initiated" | "pending" | "succeeded" | "failed" | "timed_out" | "refunded";
  amount: number;
  provider_reference: string | null;
  failure_reason: string | null;
};

const NETWORKS: { value: "mtn" | "telecel" | "airteltigo"; label: string }[] = [
  { value: "mtn", label: "MTN Mobile Money" },
  { value: "telecel", label: "Telecel Cash" },
  { value: "airteltigo", label: "AirtelTigo Money" },
];

// Polls the existing GET /api/payments/[id] — that route itself calls the
// (simulated) payment provider's pollStatus and advances the row when the
// outcome has changed (see carelink-backend/app/api/payments/[id]/route.ts).
// This is the mechanism the backend was already built to be polled by;
// nothing here decides success on its own.
function usePaymentPolling(payment: Payment | null, onUpdate: (p: Payment) => void) {
  useEffect(() => {
    if (!payment || payment.status !== "pending") return;
    let cancelled = false;
    const interval = setInterval(() => {
      apiFetch<{ payment: Payment }>(`/api/payments/${payment.id}`)
        .then((res) => {
          if (!cancelled) onUpdate(res.payment);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the polled payment's id/status changes
  }, [payment?.id, payment?.status]);
}

// The Mobile Money payment form — a dedicated screen's entire content
// (app/parent/bookings/[id]/pay), reused as-is from the booking detail
// page it used to live inline on. Still backed by the same existing
// POST /api/bookings/[id]/payments route and simulated payment
// provider; nothing about the payment mechanism itself changed.
export function PaymentForm({
  bookingId,
  amount,
  onPaid,
}: {
  bookingId: string;
  amount: number;
  onPaid: () => void;
}) {
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo">("mtn");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  usePaymentPolling(payment, (p) => {
    setPayment(p);
    if (p.status === "succeeded") onPaid();
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ payment: Payment }>(`/api/bookings/${bookingId}/payments`, {
        method: "POST",
        body: { network, payerPhone: phone },
      });
      setPayment(res.payment);
      if (res.payment.status === "succeeded") onPaid();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (payment?.status === "succeeded") {
    return (
      <Sheet className="flex flex-col items-center gap-3 text-center">
        <CheckCircle size={40} weight="fill" className="text-[var(--color-success)]" />
        <h2 className="text-[19px] font-semibold font-heading">
          Your session has been booked successfully
        </h2>
        <p className="text-[13px] text-ink-muted">Your booking is confirmed.</p>
        <div className="flex flex-col gap-1 text-[13px] text-ink-muted">
          <p>Amount paid: GH₵{payment.amount}</p>
          {payment.provider_reference && <p>Payment reference: {payment.provider_reference}</p>}
        </div>
      </Sheet>
    );
  }

  if (payment?.status === "pending") {
    return (
      <Sheet className="flex flex-col items-center gap-3 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-wisteria border-t-transparent" />
        <h2 className="text-[17px] font-semibold font-heading">Payment pending</h2>
        <p className="text-[13px] text-ink-muted">
          We&apos;re waiting for confirmation of your payment. This page checks automatically — you
          don&apos;t need to do anything.
        </p>
      </Sheet>
    );
  }

  if (payment?.status === "failed" || payment?.status === "timed_out") {
    return (
      <Sheet className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-[17px] font-semibold font-heading">
          {payment.status === "timed_out" ? "Payment timed out" : "Payment wasn't completed"}
        </h2>
        <p className="text-[13px] text-ink-muted">
          {payment.status === "timed_out"
            ? "We didn't receive confirmation in time. Please try again."
            : "We couldn't confirm your payment. Please try again."}
        </p>
        <div className="flex gap-3">
          <Button onClick={() => setPayment(null)}>Try Again</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold font-heading">Complete your booking</h2>
        <p className="text-[13px] text-ink-muted">
          Review your booking details above, then complete payment to confirm your session.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Payment method
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
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Processing your payment…" : `Pay & Confirm Booking — GH₵${amount}`}
      </Button>
    </Sheet>
  );
}
