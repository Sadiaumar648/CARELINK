"use client";

import { useState } from "react";
import Link from "next/link";
import { List, X } from "@phosphor-icons/react";
import { Button, LinkButton } from "@/components/ui/button";

const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#find-care", label: "Find Care" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#safety", label: "Safety" },
  { href: "#about", label: "About" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-sheet/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="text-[19px] font-semibold font-heading text-wisteria-pressed">
          CareLink
        </a>

        <nav className="hidden items-center gap-7 text-[14px] font-medium text-ink-muted lg:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-wisteria">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/sign-in"
            className="px-2 text-[14px] font-semibold text-ink hover:text-wisteria"
          >
            Log in
          </Link>
          <LinkButton href="/claim-invitation" variant="secondary" size="default">
            Become a Caregiver
          </LinkButton>
          <LinkButton href="/get-started" size="default">
            Get Started
          </LinkButton>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-[10px] text-ink lg:hidden"
        >
          {open ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-hairline px-6 py-4 lg:hidden">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-[10px] px-2 py-3 text-[15px] font-medium text-ink hover:bg-wisteria-tint"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex flex-col gap-2">
            <Link href="/sign-in" onClick={() => setOpen(false)}>
              <Button variant="secondary" className="w-full">
                Log in
              </Button>
            </Link>
            <Link href="/claim-invitation" onClick={() => setOpen(false)}>
              <Button variant="secondary" className="w-full">
                Become a Caregiver
              </Button>
            </Link>
            <Link href="/get-started" onClick={() => setOpen(false)}>
              <Button className="w-full">Get Started</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
