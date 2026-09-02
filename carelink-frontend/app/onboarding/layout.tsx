import Link from "next/link";
import { RequireRole } from "@/components/require-role";

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <RequireRole role="parent">
      <div className="flex min-h-dvh flex-col bg-paper">
        <header className="border-b border-hairline bg-sheet">
          <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
            <Link href="/" className="text-[17px] font-semibold font-heading text-wisteria-pressed">
              CareLink
            </Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">{children}</main>
      </div>
    </RequireRole>
  );
}
