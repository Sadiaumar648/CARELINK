"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChatCircleText } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { ConversationCardSkeleton } from "@/components/ui/skeleton";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { formatMessageTime } from "@/lib/message-time";

type BookingRow = {
  id: string;
  reference: string;
  staff_profile_id: string;
  starts_at: string;
  status: string;
};

type CaregiverBrief = { full_name: string; photo_path: string | null };
type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Conversation = {
  booking: BookingRow;
  caregiver: CaregiverBrief | null;
  lastMessage: Message | null;
  hasUnread: boolean;
};

// Messaging opens once the parent has paid — an accepted-but-unpaid
// booking has no conversation yet, so it isn't listed here.
const MESSAGEABLE = ["paid", "active", "completed"];

export default function ParentMessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ bookings: BookingRow[] }>("/api/bookings")
      .then(async (res) => {
        const messageable = res.bookings.filter((b) => MESSAGEABLE.includes(b.status));
        const withDetails = await Promise.all(
          messageable.map(async (booking) => {
            const [caregiverRes, messagesRes] = await Promise.all([
              apiFetch<{ caregiver: CaregiverBrief }>(
                `/api/caregivers/${booking.staff_profile_id}`,
              ).catch(() => null),
              apiFetch<{ messages: Message[] }>(`/api/bookings/${booking.id}/messages`).catch(
                () => ({ messages: [] as Message[] }),
              ),
            ]);
            const messages = messagesRes.messages;
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
            const hasUnread = messages.some((m) => m.sender_id !== user?.id && !m.read_at);
            return {
              booking,
              caregiver: caregiverRes?.caregiver ?? null,
              lastMessage,
              hasUnread,
            };
          }),
        );
        withDetails.sort((a, b) => {
          const aTime = new Date(a.lastMessage?.created_at ?? a.booking.starts_at).getTime();
          const bTime = new Date(b.lastMessage?.created_at ?? b.booking.starts_at).getTime();
          return bTime - aTime;
        });
        setConversations(withDetails);
      })
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user.id is stable once auth settles; refetch is via retryKey
  }, [retryKey]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Messages</h1>
        <p className="text-[14px] text-ink-muted">Your conversations with caregivers.</p>
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && conversations === null && (
        <div className="flex flex-col gap-3">
          <ConversationCardSkeleton />
          <ConversationCardSkeleton />
        </div>
      )}

      {!error && conversations && conversations.length === 0 && (
        <EmptyState
          icon={ChatCircleText}
          title="No messages yet"
          description="When you connect with a caregiver, your conversations will appear here."
        />
      )}

      {!error && conversations && conversations.length > 0 && (
        <div className="flex flex-col gap-3">
          {conversations.map((c) => (
            <Link key={c.booking.id} href={`/parent/messages/${c.booking.id}`}>
              <div className="flex items-center gap-3 rounded-[18px] border border-hairline bg-sheet p-4 hover:border-wisteria/50">
                <Avatar
                  photoUrl={caregiverPhotoUrl(c.caregiver?.photo_path)}
                  name={c.caregiver?.full_name ?? "Caregiver"}
                  size="sm"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-[15px] font-semibold text-ink">
                    {c.caregiver?.full_name ?? "Caregiver"}
                  </p>
                  <p className="truncate text-[13px] text-ink-muted">
                    {c.lastMessage ? c.lastMessage.body : "No messages yet"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <p className="text-[12px] text-ink-muted">
                    {formatMessageTime(c.lastMessage?.created_at ?? c.booking.starts_at)}
                  </p>
                  {c.hasUnread && (
                    <span
                      className="h-2 w-2 rounded-full bg-wisteria"
                      aria-label="Unread messages"
                    />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
