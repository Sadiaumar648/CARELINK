"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellSlash } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState } from "@/components/ui/empty-state";
import { minutesAgoLabel } from "@/lib/relative-time";
import { KIND_META, DEFAULT_KIND_META } from "@/lib/notification-kind-meta";

type NotificationRow = {
  id: string;
  kind: string;
  booking_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return minutesAgoLabel(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationRowItem({
  notification,
  onRead,
}: {
  notification: NotificationRow;
  onRead: (id: string) => void;
}) {
  const meta = KIND_META[notification.kind] ?? DEFAULT_KIND_META;
  const Icon = meta.icon;
  const unread = !notification.read_at;

  const content = (
    <Sheet className={`flex items-start gap-3 ${unread ? "border-sage/40 bg-sage-tint" : ""}`}>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          unread ? "bg-sheet text-sage" : "bg-paper text-ink-muted"
        }`}
      >
        <Icon size={20} weight={unread ? "fill" : "regular"} />
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[14px] font-semibold ${unread ? "text-ink" : "text-ink-muted"}`}>
            {meta.label}
          </p>
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-sage" />}
        </div>
        <p className="text-[13px] text-ink-muted">{notification.body}</p>
        <p className="text-[11.5px] text-ink-muted">{formatDateTime(notification.created_at)}</p>
      </div>
    </Sheet>
  );

  if (notification.booking_id) {
    return (
      <Link
        href={`/parent/bookings/${notification.booking_id}`}
        onClick={() => onRead(notification.id)}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onRead(notification.id)} className="w-full text-left">
      {content}
    </button>
  );
}

export default function ParentNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ notifications: NotificationRow[] }>("/api/notifications")
      .then((res) => {
        if (!cancelled) {
          setError(null);
          setNotifications(res.notifications);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  function markOneRead(id: string) {
    setNotifications((prev) =>
      prev
        ? prev.map((n) =>
            n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
          )
        : prev,
    );
    apiFetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => undefined);
  }

  function markAllRead() {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev ? prev.map((n) => ({ ...n, read_at: n.read_at ?? now })) : prev,
    );
    apiFetch("/api/notifications", { method: "PATCH" }).catch(() => undefined);
  }

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Link
        href="/parent/account"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Profile
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold font-heading">Notifications</h1>
          <p className="text-[14px] text-ink-muted">Updates on your bookings and account.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={markAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {error && <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />}

      {!error && notifications === null && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {!error && notifications?.length === 0 && (
        <Sheet className="flex flex-col items-center gap-3 py-12 text-center">
          <BellSlash size={32} className="text-ink-muted" />
          <p className="text-[15px] font-semibold text-ink">No notifications yet</p>
          <p className="text-[13px] text-ink-muted">
            Updates on your bookings and account will show up here.
          </p>
        </Sheet>
      )}

      {!error && notifications && notifications.length > 0 && (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <NotificationRowItem key={n.id} notification={n} onRead={markOneRead} />
          ))}
        </div>
      )}
    </div>
  );
}
