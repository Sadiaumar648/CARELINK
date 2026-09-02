"use client";

import Link from "next/link";
import {
  UserCircle,
  ShieldCheck,
  Baby,
  CalendarCheck,
  CreditCard,
  Bell,
  LockKey,
  Question,
  SignOut,
  CaretRight,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { VerificationForm } from "@/components/verification-form";

function MenuRow({
  icon: IconComponent,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: typeof UserCircle;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <div
      className={`flex items-center justify-between gap-3 px-5 py-4 ${
        disabled ? "text-ink-muted" : "text-ink hover:bg-paper"
      }`}
    >
      <span className="flex items-center gap-3 text-[14px] font-medium">
        <IconComponent size={20} className={disabled ? "text-ink-muted" : "text-sage"} />
        {label}
      </span>
      {disabled ? (
        <span className="text-[11.5px] text-ink-muted">Coming soon</span>
      ) : (
        <CaretRight size={16} className="text-ink-muted" />
      )}
    </div>
  );

  if (disabled) return content;
  if (href) return <Link href={href}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
}

export default function ParentAccountPage() {
  const { user, signOut } = useAuth();
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const phone = (user?.user_metadata?.phone as string | undefined) ?? "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Profile</h1>
        <p className="text-[14px] text-ink-muted">Manage your account and family information.</p>
      </div>

      <div className="flex flex-col divide-y divide-hairline overflow-hidden rounded-[18px] border border-hairline bg-sheet shadow-[var(--shadow-card)]">
        <MenuRow icon={UserCircle} label="Personal Information" href="#personal-information" />
        <MenuRow icon={ShieldCheck} label="Identity Verification" href="#identity-verification" />
        <MenuRow icon={Baby} label="Ward Profiles" href="/parent/children" />
        <MenuRow icon={CalendarCheck} label="My Bookings" href="/parent/bookings" />
        <MenuRow icon={LockKey} label="Safety & Privacy" href="/parent/safety" />
        <MenuRow icon={CreditCard} label="Payment Methods" href="/parent/payment-methods" />
        <MenuRow icon={Bell} label="Notifications" href="/parent/notifications" />
        <MenuRow icon={Question} label="Help & Support" href="/parent/help" />
        <MenuRow icon={SignOut} label="Log out" onClick={() => void signOut()} />
      </div>

      <section id="personal-information" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Personal Information
        </h2>
        <Sheet className="flex flex-col gap-2">
          {fullName && <p className="text-[15px] font-semibold">{fullName}</p>}
          <p className="text-[14px] text-ink">{user?.email}</p>
          {phone && <p className="text-[14px] text-ink-muted">{phone}</p>}
        </Sheet>
      </section>

      <section id="identity-verification" className="flex scroll-mt-20 flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Identity Verification
        </h2>
        <VerificationForm />
      </section>

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
