"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { StaffProfileSetup } from "@/components/staff-profile-setup";
import { VerificationForm } from "@/components/verification-form";

export default function StaffProfilePage() {
  const { user, signOut } = useAuth();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Profile</h1>
      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">{user?.email}</p>
        <p className="text-[13px] text-ink-muted">Caregiver</p>
      </Sheet>

      <StaffProfileSetup />
      <VerificationForm />

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
