import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const steps = [
  {
    title: "Describe what you need",
    body: "Tell us the area, the day, and what your child needs — in your own words or with filters.",
  },
  {
    title: "Choose a vetted caregiver",
    body: "Every caregiver on CareLink is identity-verified before they can accept a booking.",
  },
  {
    title: "Book, pay, and stay in touch",
    body: "Request a time, pay securely, and message your caregiver for the whole booking.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <span className="text-[19px] font-semibold">CareLink</span>
        <nav className="flex items-center gap-6 text-[15px] font-semibold">
          <Link href="/sign-in" className="text-ink hover:text-cyan">
            Sign in
          </Link>
          <LinkButton href="/register">Register</LinkButton>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-16 px-6 py-16">
        <div className="flex flex-col gap-4">
          <h1 className="text-balance text-[40px] font-semibold leading-tight">
            Vetted caregivers for your children, when you need them.
          </h1>
          <p className="max-w-[66ch] text-[15px] leading-relaxed text-ink-muted">
            CareLink connects Ghanaian parents with identity-verified caregiving staff — search,
            book, and pay, all in one place.
          </p>
          <div>
            <LinkButton href="/register">Get started</LinkButton>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <h2 className="text-[19px] font-semibold">How it works</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <Sheet key={step.title} className="flex flex-col gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-cyan">
                  Step {i + 1}
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
