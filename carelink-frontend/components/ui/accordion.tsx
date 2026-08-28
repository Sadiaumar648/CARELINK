"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

export function Accordion({ items }: { items: { question: string; answer: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col divide-y divide-hairline rounded-[18px] border border-hairline bg-sheet">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.question}>
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="text-[15px] font-semibold font-heading">{item.question}</span>
              <CaretDown
                size={18}
                className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
            {open && (
              <p className="animate-fade-in-up px-6 pb-5 text-[14px] leading-relaxed text-ink-muted">
                {item.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
