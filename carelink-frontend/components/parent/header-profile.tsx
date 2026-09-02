"use client";

import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { Avatar } from "@/components/ui/avatar";

// The header's avatar/name/chevron cluster (desktop reference design) —
// links to the existing Settings page rather than inventing a dropdown
// menu that doesn't exist yet. There's no parent profile-photo field
// anywhere in the schema, so this always shows the initials/fallback
// Avatar already handles for a null photo, not a fabricated image.
export function ParentHeaderProfile() {
  const { user } = useAuth();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "Account";

  return (
    <Link
      href="/parent/account"
      className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-wisteria-tint"
    >
      <Avatar photoUrl={null} name={fullName} size="sm" className="h-8 w-8" />
      <span className="text-[13px] font-semibold text-ink">{fullName}</span>
      <CaretDown size={14} className="text-ink-muted" />
    </Link>
  );
}
