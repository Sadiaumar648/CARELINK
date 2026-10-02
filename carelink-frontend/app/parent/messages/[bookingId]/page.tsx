"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PaperPlaneTilt, ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { formatMessageTime } from "@/lib/message-time";

type Booking = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type Caregiver = {
  full_name: string;
  photo_path: string | null;
  verification_status: string;
};

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

// Local, small, and display-only — kept separate from
// components/booking-detail.tsx's own status labels so this page never
// risks touching a component the staff/admin views also depend on.
const STATUS_LABEL: Record<string, string> = {
  accepted: "Booking accepted",
  paid: "Confirmed",
  active: "Session in progress",
  completed: "Completed",
};

function formatBookingRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)} – ${time(end)}`;
}

export default function ParentConversationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [counterpartyUserId, setCounterpartyUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function loadMessages() {
    apiFetch<{ messages: Message[] }>(`/api/bookings/${bookingId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch((err) => setLoadError(errorMessage(err)));
  }

  useEffect(() => {
    apiFetch<{ booking: Booking; counterpartyUserId: string | null }>(`/api/bookings/${bookingId}`)
      .then((res) => {
        setBooking(res.booking);
        setCounterpartyUserId(res.counterpartyUserId);
        return apiFetch<{ caregiver: Caregiver }>(
          `/api/caregivers/${res.booking.staff_profile_id}`,
        );
      })
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setLoadError(errorMessage(err)));

    apiFetch<{ messages: Message[] }>(`/api/bookings/${bookingId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch((err) => setLoadError(errorMessage(err)));
  }, [bookingId]);

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    apiFetch(`/api/bookings/${bookingId}/messages`, { method: "PATCH" }).catch(() => undefined);
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, bookingId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        body: { body: draft },
      });
      setDraft("");
      loadMessages();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState
          onRetry={() => {
            setLoadError(null);
            loadMessages();
          }}
        />
      </div>
    );
  }

  if (!booking || !caregiver) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-hairline/60" />
          <div className="h-4 w-32 animate-pulse rounded bg-hairline/60" />
        </div>
        <div className="h-64 animate-pulse rounded-[18px] bg-hairline/40" />
      </div>
    );
  }

  const firstName = caregiver.full_name.split(" ")[0];
  // Messaging opens once the booking is paid for — before that (status
  // 'accepted'), the composer is replaced with a short explanation.
  const messagingOpen = ["paid", "active", "completed"].includes(booking.status);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
      {/* Returns to wherever the conversation was opened from — a booking,
          the Messages list, a notification — not always to Messages. */}
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/parent/messages");
        }}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar
            photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
            name={caregiver.full_name}
            size="sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-semibold">{caregiver.full_name}</p>
              {caregiver.verification_status === "verified" && <VerificationBadge />}
            </div>
            <Link
              href={`/parent/caregivers/${booking.staff_profile_id}`}
              className="text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              View Caregiver Profile
            </Link>
          </div>
        </div>
      </div>

      <Sheet className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Booking with {firstName}
          </p>
          <p className="text-[13px] text-ink">
            {formatBookingRange(booking.starts_at, booking.ends_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-ink-muted">Status</p>
          <p className="text-[13px] font-semibold">
            {STATUS_LABEL[booking.status] ?? booking.status}
          </p>
        </div>
      </Sheet>

      <div className="flex flex-1 flex-col gap-3 rounded-[18px] border border-hairline bg-sheet p-4">
        <p className="text-center text-[12px] text-ink-muted">
          Keep communication respectful and related to the care arrangement.
        </p>

        <div className="flex min-h-[280px] flex-col gap-2 overflow-y-auto">
          {messages === null && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-2/3 self-start rounded-[14px]" />
              <Skeleton className="h-9 w-1/2 self-end rounded-[14px]" />
              <Skeleton className="h-9 w-3/5 self-start rounded-[14px]" />
            </div>
          )}

          {messages?.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
              <p className="text-[15px] font-semibold text-ink">Start the conversation</p>
              <p className="text-[13px] text-ink-muted">Send a message to {caregiver.full_name}.</p>
            </div>
          )}

          {messages?.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] rounded-[14px] px-3.5 py-2 text-[14px] ${
                    mine ? "bg-wisteria text-sheet" : "bg-paper text-ink"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-1 text-[11px] text-ink-muted">
                  {formatMessageTime(m.created_at)}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {sendError && <p className="text-[13px] text-error">{sendError}</p>}

        {messagingOpen ? (
          <form onSubmit={send} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message…"
              aria-label="Write a message"
              className="flex-1 rounded-[10px] border border-hairline bg-paper px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-wisteria text-sheet hover:bg-wisteria-hover disabled:opacity-50"
            >
              <PaperPlaneTilt size={18} weight="fill" />
            </button>
          </form>
        ) : (
          <p className="rounded-[10px] bg-paper px-3 py-2.5 text-center text-[13px] text-ink-muted">
            Messaging opens once you&apos;ve paid for this booking.
          </p>
        )}
      </div>

      {counterpartyUserId && (
        <Sheet className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            <ShieldCheck size={15} className="text-wisteria" />
            CareLink Safety
          </h2>
          <p className="text-[12.5px] text-ink-muted">
            Keep important booking communication within CareLink whenever possible.
          </p>
        </Sheet>
      )}
    </div>
  );
}
