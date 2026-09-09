"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { RecommendationCard } from "@/components/parent/care-ai/recommendation-card";
import type { CareRequestDraft } from "@carelink/shared";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Recommendation = { type: "nanny" | "babysitter"; reason: string };

const SUGGESTED_PROMPTS = [
  "I work 8am to 5pm and need someone to care for my 2-year-old while I'm at work.",
  "I need someone to watch my daughter for four hours while I'm at an event on Saturday.",
  "Not sure what I need — help me decide.",
];

const INTRO_MESSAGE =
  "Hi, I'm Nia 👋 Not sure whether you need a Nanny or a Babysitter? Tell me a bit about your situation — how often you need care, and for how long — and I'll help you decide.";

function CareAiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<CareRequestDraft>({});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chosenType, setChosenType] = useState<"nanny" | "babysitter" | null>(null);

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
    const type = searchParams.get("type");
    if (!area && !date && !startTime && !endTime && !skills && !type) return;

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
      if (type === "nanny" || type === "babysitter") setChosenType(type);
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
        recommendation: Recommendation | null;
      }>("/api/care-assistant/message", {
        method: "POST",
        body: { messages: nextMessages, draft },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setDraft(res.draft);
      setRecommendation(res.recommendation);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Nia's one real job is done the moment a type is chosen: recommend
  // Nanny or Babysitter, nothing more. It never creates a care request,
  // searches, or dispatches itself — and, just as deliberately, it never
  // carries anything it learned in conversation into the request form
  // either. Only `panel` is sent, so /parent's own ?panel= reader
  // (app/parent/page.tsx) opens the exact same RequestFlowPanel a parent
  // gets from the direct Nanny/Babysitter cards, completely empty —
  // every field (child, date, time, duration, repeat, location, care
  // needs, notes, preferred caregiver) is left for the parent to fill in
  // themselves. Location especially: even if the parent told Nia "I need
  // a babysitter in East Legon", that "East Legon" is never forwarded
  // here — the parent must explicitly choose Use my current location or
  // Enter a GPS address on the form itself.
  function chooseType(type: "nanny" | "babysitter") {
    router.push(`/parent?panel=${type}`);
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
                Use the direct Nanny/Babysitter option
              </Link>
            </div>
          </div>
        )}

        {recommendation && !chosenType && (
          <RecommendationCard recommendation={recommendation} onChoose={chooseType} />
        )}

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
