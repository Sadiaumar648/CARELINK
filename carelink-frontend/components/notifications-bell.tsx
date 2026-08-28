"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";

type Notification = {
  id: string;
  kind: string;
  booking_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell({
  bookingHref,
}: {
  bookingHref?: (bookingId: string) => string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function load() {
    apiFetch<{ notifications: Notification[]; unreadCount: number }>("/api/notifications")
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {});
  }

  useEffect(load, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && unreadCount > 0) {
        apiFetch("/api/notifications", { method: "PATCH" })
          .then(load)
          .catch(() => {});
      }
      return next;
    });
  }

  function onSelect(n: Notification) {
    setOpen(false);
    if (n.booking_id && bookingHref) router.push(bookingHref(n.booking_id));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex items-center justify-center rounded p-2 text-ink-muted hover:text-ink"
      >
        <Bell size={22} weight={unreadCount > 0 ? "duotone" : "regular"} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold text-sheet">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] rounded border border-hairline bg-sheet shadow-[var(--shadow-sheet)]">
          {notifications.length === 0 ? (
            <p className="p-4 text-[13px] text-ink-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-hairline last:border-b-0">
                  <button
                    onClick={() => onSelect(n)}
                    className={`w-full px-4 py-3 text-left text-[13px] hover:bg-paper ${
                      n.read_at ? "text-ink-muted" : "text-ink"
                    }`}
                  >
                    {n.body}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
