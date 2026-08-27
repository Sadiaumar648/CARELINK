import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const steps = [
  {
    title: "Describe what you need",
    body: "Tell us the area, the day, and what your child needs — in your own words or with filters.",
    accent: "bg-cyan text-sheet",
  },
  {
    title: "Choose a vetted caregiver",
    body: "Every caregiver on CareLink is identity-verified before they can accept a booking.",
    accent: "bg-magenta text-sheet",
  },
  {
    title: "Book, pay, and stay in touch",
    body: "Request a time, pay securely, and message your caregiver for the whole booking.",
    accent: "bg-[var(--color-success)] text-sheet",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <span className="text-[19px] font-semibold text-cyan-pressed">CareLink</span>
        <nav className="flex items-center gap-6 text-[15px] font-semibold">
          <Link href="/sign-in" className="text-ink hover:text-cyan">
            Sign in
          </Link>
          <LinkButton href="/register">Register</LinkButton>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-16 px-6 py-16">
        <div
          className="flex flex-col gap-4 rounded-3xl p-10"
          style={{
            background: "linear-gradient(135deg, var(--color-cyan) 0%, var(--color-magenta) 100%)",
          }}
        >
          <h1 className="text-balance text-[40px] font-semibold leading-tight text-sheet">
            Vetted caregivers for your children, when you need them.
          </h1>
          <p className="max-w-[66ch] text-[15px] leading-relaxed text-sheet/90">
            CareLink connects Ghanaian parents with identity-verified caregiving staff — search,
            book, and pay, all in one place.
          </p>
          <div>
            <LinkButton
              href="/register"
              variant="secondary"
              className="border-none shadow-lg"
              style={{ backgroundColor: "var(--color-sheet)", color: "var(--color-cyan-pressed)" }}
            >
              Get started
            </LinkButton>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <h2 className="text-[19px] font-semibold">How it works</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <Sheet key={step.title} className="flex flex-col gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold ${step.accent}`}
                >
                  {i + 1}
                </span>
                <h3 className="text-[17px] font-semibold">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-muted">{step.body}</p>
              </Sheet>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
