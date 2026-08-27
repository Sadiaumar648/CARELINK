"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

export default function ParentAccountPage() {
  const { user, signOut } = useAuth();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Account</h1>
      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">{user?.email}</p>
        <p className="text-[13px] text-ink-muted">Parent</p>
      </Sheet>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
