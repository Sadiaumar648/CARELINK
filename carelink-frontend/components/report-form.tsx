"use client";

import { useState } from "react";
import { reportCategorySchema, type ReportCategory } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ReportForm({
  bookingId,
  subjectUserId,
}: {
  bookingId: string;
  subjectUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("other");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        body: { bookingId, subjectUserId, category, description },
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="text-[13px] text-ink-muted">
        Report submitted — an administrator will follow up.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Report an issue
      </Button>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">Report an issue with this booking</h2>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reportCategory"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Category
        </label>
        <select
          id="reportCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value as ReportCategory)}
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        >
          {reportCategorySchema.options.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="reportDescription"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          What happened
        </label>
        <textarea
          id="reportDescription"
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        />
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" variant="danger" disabled={submitting || !description.trim()}>
          {submitting ? "Submitting…" : "Submit report"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </Sheet>
  );
}
