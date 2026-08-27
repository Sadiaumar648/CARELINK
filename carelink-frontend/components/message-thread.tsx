"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

type Message = { id: string; sender_id: string; body: string; created_at: string };

export function MessageThread({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function load() {
    apiFetch<{ messages: Message[] }>(`/api/bookings/${bookingId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch((err) => setError(errorMessage(err)));
  }

  useEffect(load, [bookingId]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      apiFetch(`/api/bookings/${bookingId}/messages`, { method: "PATCH" }).catch(() => {});
      bottomRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages, bookingId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        body: { body: draft },
      });
      setDraft("");
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet className="flex flex-col gap-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Messages
      </h2>

      {messages === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {messages?.length === 0 && <p className="text-[13px] text-ink-muted">No messages yet.</p>}

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {messages?.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded px-3 py-2 text-[15px] ${
                  mine ? "bg-cyan text-sheet" : "bg-paper text-ink"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-[13px] text-magenta">{error}</p>}

      <form onSubmit={send} className="flex gap-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded border border-hairline bg-paper px-3 py-2 text-[15px] text-ink"
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          Send
        </Button>
      </form>
    </Sheet>
  );
}
