"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { apiFetch, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffProfileSetup } from "@/components/staff-profile-setup";
import { VerificationForm } from "@/components/verification-form";

type ChecklistItem = { label: string; done: boolean };

const VERIFICATION_NOTE: Record<string, string> = {
  pending: "Your documents are being reviewed.",
  verified: "Your identity has been verified.",
  rejected: "We need you to review your submitted information.",
};

function ProfileCompletion() {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>("unverified");

  useEffect(() => {
    Promise.all([
      apiFetch<{ profile: { photo_path: string | null; bio: string | null } | null }>(
        "/api/staff/profile",
      ),
      apiFetch<{ skills: string[] }>("/api/staff/skills").catch(() => ({ skills: [] })),
      apiFetch<{ areas: unknown[] }>("/api/staff/areas").catch(() => ({ areas: [] })),
      apiFetch<{ windows: unknown[] }>("/api/staff/availability").catch((err) => {
        if (err instanceof ApiError && err.status === 400) return { windows: [] };
        throw err;
      }),
      apiFetch<{ submissions: { status: string }[] }>("/api/verification/submissions").catch(
        () => ({ submissions: [] }),
      ),
    ])
      .then(([profileRes, skillsRes, areasRes, availabilityRes, verificationRes]) => {
        const latest = verificationRes.submissions[0];
        setVerificationStatus(latest?.status ?? "unverified");
        setItems([
          { label: "Basic information", done: Boolean(profileRes.profile) },
          { label: "Profile photo", done: Boolean(profileRes.profile?.photo_path) },
          { label: "Skills", done: skillsRes.skills.length > 0 },
          { label: "Areas you work in", done: areasRes.areas.length > 0 },
          { label: "Availability", done: availabilityRes.windows.length > 0 },
          { label: "Identity verification", done: latest?.status === "verified" },
        ]);
      })
      .catch(() => setItems(null));
  }, []);

  if (!items) {
    return <Skeleton className="h-32" />;
  }

  const doneCount = items.filter((i) => i.done).length;
  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">
          Your CareLink profile is {percent}% complete.
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
        <div className="h-full rounded-full bg-sage" style={{ width: `${percent}%` }} />
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {items.map((item) => (
          <li key={item.label} className={item.done ? "text-ink" : "text-ink-muted"}>
            {item.done ? "✓" : "○"} {item.label}
          </li>
        ))}
      </ul>
      {verificationStatus !== "unverified" && VERIFICATION_NOTE[verificationStatus] && (
        <p className="border-t border-hairline pt-2 text-[13px] text-ink-muted">
          {VERIFICATION_NOTE[verificationStatus]}
        </p>
      )}
    </Sheet>
  );
}

export default function StaffProfilePage() {
  const { user, signOut } = useAuth();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">Profile</h1>
        <p className="text-[14px] text-ink-muted">
          Your profile represents your professional experience to families.
        </p>
      </div>

      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">{user?.email}</p>
        <p className="text-[13px] text-ink-muted">Caregiver</p>
      </Sheet>

      <ProfileCompletion />

      <StaffProfileSetup />
      <VerificationForm />

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
