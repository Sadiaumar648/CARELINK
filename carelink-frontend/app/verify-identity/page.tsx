"use client";

import Link from "next/link";
import { RequireRole } from "@/components/require-role";
import { ParentIdentityVerification } from "@/components/parent/identity-verification";

// Same logo-only header style as /register — this page is the
// mandatory next step right after registration, not part of the
// Parent Home dashboard shell, so it deliberately doesn't use
// RoleShell/app/parent/layout.tsx.
function VerifyIdentityHeader() {
  return (
    <header className="border-b border-hairline bg-sheet/95 px-6 py-4">
      <Link
        href="/"
        className="text-[19px] font-semibold font-heading text-wisteria-pressed transition-colors hover:text-wisteria"
      >
        CareLink
      </Link>
    </header>
  );
}

// A parent lands here immediately after registration (via
// router.replace in app/register/page.tsx), and app/parent/layout.tsx
// sends any signed-in parent whose verificationStatus isn't "verified"
// back here too — on a direct dashboard URL, a refresh, or logging
// back in after abandoning verification. Once ParentIdentityVerification
// succeeds, its "Continue to CareLink" button (continueHref="/parent")
// is the only way forward from here into the dashboard.
export default function VerifyIdentityPage() {
  return (
    <RequireRole role="parent">
      <div className="flex flex-1 flex-col">
        <VerifyIdentityHeader />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] font-semibold font-heading">Verify your identity</h1>
            <p className="text-[14px] text-ink-muted">
              CareLink requires every parent to verify their Ghana Card before they can find or book
              care. This only takes a minute.
            </p>
          </div>
          <ParentIdentityVerification continueHref="/parent" />
        </div>
      </div>
    </RequireRole>
  );
}
