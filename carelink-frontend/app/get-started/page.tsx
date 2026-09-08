import Link from "next/link";
import { Baby } from "@phosphor-icons/react/dist/ssr";
import { PublicFooter } from "@/components/public-footer";
import { Sheet } from "@/components/ui/sheet";

export const metadata = {
  title: "Get started · CareLink",
};

// Parent-only: caregivers don't self-register through this page — they
// join via an agency/admin onboarding invitation (see /claim-invitation),
// not a public choice here.
const PARENT_ROLE = {
  href: "/register",
  icon: Baby,
  title: "Find care for your family",
  subtitle: "For parents and families",
  body: "Tell us what you need, and we'll help you find a suitable nanny or babysitter.",
  cta: "Continue as Parent",
};

export default function GetStartedPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-hairline bg-sheet/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <Link
            href="/"
            className="text-[19px] font-semibold font-heading text-wisteria-pressed transition-colors hover:text-wisteria"
          >
            CareLink
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-balance text-[30px] font-semibold font-heading sm:text-[36px]">
            Welcome to CareLink
          </h1>
          <p className="text-[16px] text-ink-muted">Let&apos;s get your care started.</p>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <Link href={PARENT_ROLE.href} className="group">
            <Sheet className="flex h-full flex-col gap-4 transition-shadow group-hover:shadow-[var(--shadow-card-hover)]">
              <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-wisteria-tint text-wisteria-pressed">
                <PARENT_ROLE.icon size={24} weight="fill" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-[19px] font-semibold font-heading">{PARENT_ROLE.title}</h2>
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  {PARENT_ROLE.subtitle}
                </p>
              </div>
              <p className="flex-1 text-[14px] leading-relaxed text-ink-muted">
                {PARENT_ROLE.body}
              </p>
              <span className="text-[14px] font-semibold text-wisteria group-hover:text-wisteria-hover">
                {PARENT_ROLE.cta}
              </span>
            </Sheet>
          </Link>
        </div>

        <p className="text-center text-[13px] text-ink-muted">
          <span className="font-semibold text-ink">Are you a caregiver?</span> You&apos;ll need an
          invitation from your agency to join CareLink.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
