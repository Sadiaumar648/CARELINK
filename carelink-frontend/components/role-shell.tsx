"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";

export type NavItem = { href: string; label: string; icon: Icon };

// The App Flow doc's per-role nav, responsive: a bottom tab bar on narrow
// screens, a left rail on wide ones — never icon-only, always paired with
// a label.
export function RoleShell({ items, children }: { items: NavItem[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <nav className="order-2 flex justify-around border-t border-hairline bg-sheet md:order-1 md:w-56 md:flex-col md:justify-start md:gap-1 md:border-t-0 md:border-r md:p-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-2 text-[13px] font-semibold md:flex-row md:gap-2 md:rounded ${
                active ? "text-cyan" : "text-ink-muted hover:text-ink"
              }`}
            >
              <ItemIcon size={24} weight={active ? "duotone" : "regular"} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => void signOut()}
          className="hidden items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-muted hover:text-magenta md:mt-auto md:flex md:rounded"
        >
          <SignOut size={24} />
          Sign out
        </button>
      </nav>
      <main className="order-1 flex-1 md:order-2">{children}</main>
    </div>
  );
}
