"use client";

import Image from "next/image";
import { ArrowRight } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";

export function CareTypeCard({
  title,
  description,
  imageSrc,
  imageAlt,
  onClick,
}: {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  onClick: () => void;
}) {
  return (
    <Sheet className="overflow-hidden border-[var(--color-lavender-border)] p-0">
      <button type="button" onClick={onClick} className="group relative block aspect-[6/5] w-full">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(min-width: 640px) 340px, 90vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-5">
          <div className="text-left">
            <p className="text-[20px] font-semibold font-heading text-white">{title}</p>
            <p className="text-[13px] text-white/85">{description}</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 translate-y-2 items-center justify-center rounded-full bg-sheet text-ink shadow-[var(--shadow-card)] transition-transform group-hover:translate-y-0">
            <ArrowRight size={18} />
          </span>
        </div>
      </button>
    </Sheet>
  );
}
