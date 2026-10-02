"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PaperPlaneTilt, Sparkle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "Are there any reports to attend to today?",
  "How much revenue have we generated this week?",
  "Have I paid all caregivers?",
  "Is there anyone waiting on identity verification?",
];

// CareLink's admin assistant — a read-only Q&A tool, not a general
// chatbot: it can only answer questions from real CareLink data via
// lib/services/admin-assistant.ts's tools, and it can never take an
// action (resolve a report, approve a verification, etc.) on the
// admin's behalf. Stateless on the backend — this page keeps the full
// transcript client-side and resends it every turn, same pattern as
// Nia's own conversation (components elsewhere already do this for the
// parent-facing assistant).
export default function AdminAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setDraft("");
    setSending(true);
    try {
      const res = await apiFetch<{ reply: string }>("/api/admin/assistant", {
        method: "POST",
        body: { messages: next },
      });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(errorMessage(err));
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
      <Link
        href="/admin"
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <Sparkle size={18} weight="fill" />
        </span>
        <div>
          <h1 className="text-[19px] font-semibold font-heading text-ink">Admin Assistant</h1>
          <p className="text-[12.5px] text-ink-muted">
            Ask about reports, revenue, bookings, caregivers, or families. Read-only — it never
            changes anything for you.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 rounded-[18px] border border-hairline bg-sheet p-4">
        <div className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
              <p className="text-[14px] text-ink-muted">Try asking something like:</p>
              <div className="flex flex-col gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    className="rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink hover:border-wisteria"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                  m.role === "user" ? "bg-wisteria text-sheet" : "bg-paper text-ink"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-[14px] bg-paper px-3.5 py-2.5 text-[14px] text-ink-muted">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-[13px] text-error">{error}</p>}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about CareLink…"
            aria-label="Ask the admin assistant"
            disabled={sending}
            className="flex-1 rounded-[10px] border border-hairline bg-paper px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-wisteria text-sheet hover:bg-wisteria-hover disabled:opacity-50"
          >
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  );
}
