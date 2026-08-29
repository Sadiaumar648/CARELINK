import Link from "next/link";
import { ArrowRight, Baby, HandHeart } from "@phosphor-icons/react/dist/ssr";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";
import { Sheet } from "@/components/ui/sheet";

export const metadata = {
  title: "Get started · CareLink",
};

const ROLES = [
  {
    href: "/register",
    icon: Baby,
    title: "I'm looking for care",
    subtitle: "For parents and families",
    body: "Find verified nannies and babysitters based on your family's needs.",
    cta: "Continue as Parent",
  },
  {
    href: "/claim-invitation",
    icon: HandHeart,
    title: "I'm a caregiver",
    subtitle: "For nannies and babysitters",
    body: "Create your professional profile and connect with families.",
    cta: "Continue as Caregiver",
  },
];

export default function GetStartedPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-balance text-[30px] font-semibold font-heading sm:text-[36px]">
            Welcome to CareLink
          </h1>
          <p className="text-[16px] text-ink-muted">How would you like to use CareLink?</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {ROLES.map((role) => (
            <Link key={role.href} href={role.href} className="group">
              <Sheet className="flex h-full flex-col gap-4 transition-shadow group-hover:shadow-[var(--shadow-card-hover)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-sage-tint text-sage-pressed">
                  <role.icon size={24} weight="fill" />
                </span>
                <div className="flex flex-col gap-1">
                  <h2 className="text-[19px] font-semibold font-heading">{role.title}</h2>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {role.subtitle}
                  </p>
                </div>
                <p className="flex-1 text-[14px] leading-relaxed text-ink-muted">{role.body}</p>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-sage group-hover:text-sage-hover">
                  {role.cta} <ArrowRight size={16} />
                </span>
              </Sheet>
            </Link>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
