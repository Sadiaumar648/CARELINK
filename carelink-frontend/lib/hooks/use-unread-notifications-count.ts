"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

// A small, single-purpose read of the same unreadCount already returned
// by GET /api/notifications (see NotificationsBell and
// /parent/notifications) — used to badge the sidebar's Notifications nav
// item. This is its own independent fetch, not a shared cache: it does
// not reduce the number of network calls, only the duplicated shape/typing
// across call sites.
export function useUnreadNotificationsCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ unreadCount: number }>("/api/notifications")
      .then((res) => {
        if (!cancelled) setCount(res.unreadCount ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
