"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { ContinueToRequestCard } from "@/components/parent/care-ai/continue-to-request-card";
import type { CareRequestDraft } from "@carelink/shared";

type ChatTurn = { role: "user" | "assistant"; content: string };

const SUGGESTED_PROMPTS = [
  "I work 8am to 5pm and need someone to care for my 2-year-old while I'm at work.",
  "I need someone to watch my daughter for four hours while I'm at an event on Saturday.",
  "Not sure where to start — help me figure out what I need.",
];

const INTRO_MESSAGE =
  "Hi, I'm Nia 👋 Tell me a bit about the care you need — who it's for, and how often or how long — and I'll help you get your request ready.";

function CareAiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<CareRequestDraft>({});
  const [readyToConfirm, setReadyToConfirm] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // A round trip from Find Care's "Edit your request" — the assistant
  // silently already knows what was asked before, so the parent doesn't
  // have to repeat it; nothing here is shown as a chat bubble.
  useEffect(() => {
    const area = searchParams.get("area");
    const date = searchParams.get("date");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const skills = searchParams.get("skills");
    if (!area && !date && !startTime && !endTime && !skills) return;

    void Promise.resolve().then(() => {
      setDraft({
        location: area ?? undefined,
        date: date ?? undefined,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        skills: skills
          ? (skills.split(",").filter(Boolean) as CareRequestDraft["skills"])
          : undefined,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, from the initial URL only
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await apiFetch<{
        reply: string;
        draft: CareRequestDraft;
        readyToConfirm: boolean;
      }>("/api/care-assistant/message", {
        method: "POST",
        body: { messages: nextMessages, draft },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setDraft(res.draft);
      setReadyToConfirm(res.readyToConfirm);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Nia's one real job: help a parent put their care needs into words.
  // She never creates a care request, searches, or dispatches herself —
  // and, just as deliberately, never carries the location she learned
  // in conversation onto the request form either. Only the fields
  // below (care needs, timing, notes) are handed off; `panel` alone
  // opens the exact same RequestFlowPanel a parent gets from Find Care
  // directly (app/parent/page.tsx's own ?panel= reader), with location
  // and everything else still left for the parent to fill in themselves.
  function continueToRequest() {
    const params = new URLSearchParams({ panel: "nanny" });
    if (draft.date) params.set("startDate", draft.date);
    if (draft.startTime && draft.endTime) {
      const hours = Math.round(
        (new Date(`2000-01-01T${draft.endTime}`).getTime() -
          new Date(`2000-01-01T${draft.startTime}`).getTime()) /
          3_600_000,
      );
      if (hours > 0) params.set("hours", String(hours));
    }
    if (draft.wardAgeYears !== undefined) params.set("age", String(draft.wardAgeYears));
    if (draft.notes) params.set("requirements", draft.notes);
    router.push(`/parent?${params.toString()}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Link
        href="/parent"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Home
      </Link>

      <div className="flex items-center gap-2">
        <Sparkle size={20} weight="fill" className="text-wisteria" />
        <h1 className="text-[20px] font-semibold font-heading text-ink">Nia</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="max-w-[85%] self-start rounded-[14px] rounded-tl-sm border border-[var(--color-lavender-border)] bg-sheet px-4 py-2.5 text-[13.5px] text-ink">
          {INTRO_MESSAGE}
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(p)}
                className="rounded-full border border-[var(--color-lavender-border)] bg-sheet px-3 py-1.5 text-left text-[12.5px] text-ink hover:border-wisteria hover:text-wisteria"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-[14px] px-4 py-2.5 text-[13.5px] ${
              m.role === "user"
                ? "self-end rounded-tr-sm bg-wisteria text-white"
                : "self-start rounded-tl-sm border border-[var(--color-lavender-border)] bg-sheet text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="self-start rounded-[14px] rounded-tl-sm border border-[var(--color-lavender-border)] bg-sheet px-4 py-2.5 text-[13px] text-ink-muted">
            Nia is typing…
          </div>
        )}

        {error && (
          <div className="flex flex-col gap-2 self-start rounded-[14px] border border-error bg-error-tint px-4 py-3 text-[13px] text-error">
            <p>{error}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void send(messages[messages.length - 1]?.content ?? "")}
                className="font-semibold underline"
              >
                Try again
              </button>
              <Link href="/parent" className="font-semibold underline">
                Go to Find Care instead
              </Link>
            </div>
          </div>
        )}

        {readyToConfirm && <ContinueToRequestCard onContinue={continueToRequest} />}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the care you need…"
          disabled={loading}
          className="flex-1 rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          <PaperPlaneRight size={16} weight="fill" />
        </Button>
      </form>
    </div>
  );
}

export default function ParentCareAiPageWrapper() {
  return (
    <Suspense>
      <CareAiPage />
    </Suspense>
  );
}
