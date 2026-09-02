"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { RecommendationCard } from "@/components/parent/care-ai/recommendation-card";
import { ConfirmationCard } from "@/components/parent/care-ai/confirmation-card";
import type { Ward } from "@/components/find-care/types";
import type { CareRequestDraft } from "@carelink/shared";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Recommendation = { type: "nanny" | "babysitter"; reason: string };

const SUGGESTED_PROMPTS = [
  "I need a babysitter for my 4-year-old this Saturday from 9am to 3pm in East Legon.",
  "I need regular weekday care for my toddler while I work.",
  "Not sure what I need — help me decide.",
];

const INTRO_MESSAGE =
  "Hi, I'm CareLink AI 👋 Tell me a bit about the care you need — who it's for, and when — and I'll help you find the right caregiver.";

function CareAiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<CareRequestDraft>({});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [chosenType, setChosenType] = useState<"nanny" | "babysitter" | null>(null);
  const [editing, setEditing] = useState(false);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wards, setWards] = useState<Ward[] | null>(null);
  const [wardId, setWardId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch(() => setWards([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // The parent's explicit choice (from the recommendation card, or
  // carried over from an earlier direct-flow round trip) always wins
  // over whatever the model's own draft.caregiverType says.
  const effectiveDraft: CareRequestDraft = chosenType
    ? { ...draft, caregiverType: chosenType }
    : draft;
  const canShowConfirmation = readyToConfirm && Boolean(effectiveDraft.caregiverType) && !editing;

  // A best-effort ward suggestion by stated age — never auto-picked
  // without a real ward existing, and the parent can always change it.
  useEffect(() => {
    if (!wards || wardId) return;
    const suggested =
      wards.length === 1
        ? wards[0].id
        : (wards.find((w) => w.age_years === draft.wardAgeYears)?.id ?? null);
    if (!suggested) return;
    // A derived default, not a synchronous external read — deferred out
    // of the effect body the same way this codebase already handles
    // react-hooks/set-state-in-effect elsewhere.
    void Promise.resolve().then(() => setWardId(suggested));
  }, [wards, draft.wardAgeYears, wardId]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setEditing(false);
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await apiFetch<{
        reply: string;
        draft: CareRequestDraft;
        recommendation: Recommendation | null;
        readyToConfirm: boolean;
      }>("/api/care-assistant/message", {
        method: "POST",
        body: { messages: nextMessages, draft },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      setDraft(res.draft);
      setRecommendation(res.recommendation);
      setReadyToConfirm(res.readyToConfirm);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!wardId || !effectiveDraft.caregiverType) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await apiFetch("/api/care-requests", {
        method: "POST",
        body: {
          wardId,
          source: "ai",
          caregiverType: effectiveDraft.caregiverType,
          date: effectiveDraft.date,
          startTime: effectiveDraft.startTime,
          endTime: effectiveDraft.endTime,
          location: effectiveDraft.location,
          skills: effectiveDraft.skills,
          notes: effectiveDraft.notes,
          aiRecommendation: recommendation?.type,
          aiRecommendationReason: recommendation?.reason,
        },
      });

      const params = new URLSearchParams();
      if (effectiveDraft.location) params.set("area", effectiveDraft.location);
      if (effectiveDraft.date) params.set("date", effectiveDraft.date);
      if (effectiveDraft.startTime) params.set("startTime", effectiveDraft.startTime);
      if (effectiveDraft.endTime) params.set("endTime", effectiveDraft.endTime);
      if (effectiveDraft.skills?.length) params.set("skills", effectiveDraft.skills.join(","));
      params.set("type", effectiveDraft.caregiverType);
      params.set("panel", effectiveDraft.caregiverType);
      params.set("source", "ai");
      router.push(`/parent/find-care?${params.toString()}`);
    } catch (err) {
      setConfirmError(errorMessage(err));
    } finally {
      setConfirming(false);
    }
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
        <h1 className="text-[20px] font-semibold font-heading text-ink">CareLink AI</h1>
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
            CareLink AI is typing…
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
          <RecommendationCard recommendation={recommendation} onChoose={setChosenType} />
        )}

        {canShowConfirmation && (
          <ConfirmationCard
            draft={effectiveDraft}
            wards={wards ?? []}
            wardId={wardId}
            onSelectWard={setWardId}
            onConfirm={() => void confirm()}
            onEdit={() => setEditing(true)}
            confirming={confirming}
          />
        )}
        {confirmError && <p className="text-[13px] text-error">{confirmError}</p>}

        <div ref={bottomRef} />
      </div>

      {!canShowConfirmation && (
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
          <Button type="submit" variant="accent" disabled={loading || !input.trim()}>
            <PaperPlaneRight size={16} weight="fill" />
          </Button>
        </form>
      )}
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
