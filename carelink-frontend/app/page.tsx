import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck,
  IdentificationCard,
  LockKey,
  ChatCircleText,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import { LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SectionHeading } from "@/components/ui/section-heading";
import { CaregiverCard } from "@/components/ui/caregiver-card";
import { Accordion } from "@/components/ui/accordion";
import { AiSearchSection } from "@/components/ai-search-section";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";

const TRUST_FEATURES = [
  {
    icon: IdentificationCard,
    title: "Identity verification",
    body: "Know who you're booking.",
  },
  {
    icon: ShieldCheck,
    title: "Verified profiles",
    body: "See relevant experience and credentials.",
  },
  {
    icon: LockKey,
    title: "Secure booking",
    body: "Clear terms and booking records.",
  },
  {
    icon: ChatCircleText,
    title: "Real reviews",
    body: "Hear from families after completed bookings.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Tell us what you need",
    body: "Search by area, date and skills, or just describe it in your own words.",
  },
  {
    number: "02",
    title: "Find your match",
    body: "Compare verified caregivers, ranked by availability, location, skills and rating.",
  },
  {
    number: "03",
    title: "Book with confidence",
    body: "Request a time, pay by Mobile Money, and message your caregiver throughout.",
  },
];

const DEMO_CAREGIVERS = [
  {
    name: "Ama Mensah",
    photoUrl: "/demo/ama-mensah.jpeg",
    yearsExperience: 5,
    area: "East Legon",
    ratingAvg: 4.9,
    ratingCount: 27,
    skills: ["infant_care", "toddler_care"],
    hourlyRate: 25,
  },
  {
    name: "Efua Owusu",
    photoUrl: "/demo/efua-owusu.jpeg",
    yearsExperience: 3,
    area: "Osu",
    ratingAvg: 4.8,
    ratingCount: 14,
    skills: ["school_age_supervision", "meal_preparation"],
    hourlyRate: 20,
  },
  {
    name: "Maame Ama",
    photoUrl: "/demo/maame-ama.jpeg",
    yearsExperience: 7,
    area: "Airport Residential",
    ratingAvg: 5,
    ratingCount: 41,
    skills: ["newborn_care", "special_needs_care"],
    hourlyRate: 30,
  },
];

const MATCH_REASONS = [
  { label: "Available at your requested time", factor: "Availability" },
  { label: "Works in your area", factor: "Area" },
  { label: "Within your budget", factor: "Budget" },
  { label: "Experience and skills that fit", factor: "Skills" },
  { label: "Highly rated by other families", factor: "Rating & experience" },
];

const SAFETY_ITEMS = [
  "Identity verification",
  "Reference contacts",
  "Administrator review",
  "Transparent ratings",
  "Controlled emergency-contact sharing",
  "Reporting and dispute support",
];

const TESTIMONIALS = [
  {
    quote:
      "Booking through CareLink was so much simpler than asking around for recommendations. I could see everything I needed before reaching out.",
    name: "A CareLink parent",
  },
  {
    quote:
      "Having a care profile for my daughter meant I didn't have to explain her routine from scratch every time. It's already there.",
    name: "A CareLink parent",
  },
  {
    quote:
      "The verification process felt thorough without being a hassle. It's reassuring to know the platform actually checks.",
    name: "A CareLink parent",
  },
];

const FAQ_ITEMS = [
  {
    question: "How does CareLink verify caregivers?",
    answer:
      "Caregivers submit a government ID, a live photo, and a reference contact. An administrator reviews every submission by hand before an account is marked verified.",
  },
  {
    question: "Do parents need to verify their identity?",
    answer:
      "Yes — both parents and caregivers go through the same identity verification before a booking can be requested or accepted.",
  },
  {
    question: "How does caregiver matching work?",
    answer:
      "Search results are ranked using five factors: availability for your requested time, service area, relevant skills, rating and experience, and how well the rate fits your budget.",
  },
  {
    question: "How does Mobile Money payment work?",
    answer:
      "Once a caregiver accepts your request, you pay the agreed amount by MTN, Telecel or AirtelTigo Mobile Money before the booking begins.",
  },
  {
    question: "What happens if I have a problem during a booking?",
    answer:
      "You can message your caregiver directly through the booking, and file a report if something goes wrong — every report is reviewed by an administrator.",
  },
  {
    question: "Who can see my child's care information?",
    answer:
      "Only you and the caregiver assigned to a specific booking can see your child's care profile. It's never public, and a caregiver only sees it once a booking is in place.",
  },
];

export default function Home() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <PublicNav />

      <main className="flex flex-col gap-24 py-20 sm:gap-28">
        {/* HERO */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col gap-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sage">
                Trusted childcare, made simple
              </span>
              <h1 className="text-balance text-[38px] font-semibold leading-[1.15] sm:text-[48px]">
                Trusted care, closer to home.
              </h1>
              <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">
                Finding someone you trust with your child shouldn&apos;t feel complicated. CareLink
                helps families discover, compare and book verified nannies and babysitters from a
                trusted caregiving agency.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <LinkButton href="/register">Find a Caregiver →</LinkButton>
                <LinkButton href="/claim-invitation" variant="secondary">
                  Become a Caregiver
                </LinkButton>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[13px] text-ink-muted">
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--color-success)]">✓</span> Verified caregivers
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--color-success)]">✓</span> Secure bookings
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--color-success)]">✓</span> Mobile Money payments
                </li>
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div className="relative aspect-square w-full overflow-hidden rounded-[24px]">
                <Image
                  src="/demo/hero-reading.jpeg"
                  alt="A caregiver reading picture books with a toddler on a bed"
                  fill
                  sizes="(min-width: 1024px) 384px, 90vw"
                  className="object-cover"
                  priority
                />
              </div>
              <Sheet className="absolute -bottom-4 -left-4 flex w-56 items-center gap-3 p-4 sm:-bottom-6 sm:-left-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-tint text-[var(--color-success)]">
                  ✓
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                    Verified caregiver
                  </p>
                  <p className="text-[14px] font-semibold font-heading">Ama Mensah</p>
                  <p className="text-[12px] text-ink-muted">★★★★★ 4.9 · 5 yrs experience</p>
                </div>
              </Sheet>
            </div>
          </div>
        </section>

        {/* TRUST STRIP / ABOUT */}
        <section id="about" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6">
          <SectionHeading title="Care that puts trust first." align="center" />
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_FEATURES.map((f) => (
              <Sheet key={f.title} className="flex flex-col gap-3">
                <f.icon size={26} weight="duotone" className="text-sage" />
                <h3 className="text-[16px] font-semibold font-heading">{f.title}</h3>
                <p className="text-[14px] text-ink-muted">{f.body}</p>
              </Sheet>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6">
          <SectionHeading title="Finding care shouldn't be complicated." align="center" />
          <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px] lg:order-2">
              <Image
                src="/demo/how-it-works-reading.jpeg"
                alt="A caregiver reading to a child on a bed"
                fill
                sizes="(min-width: 1024px) 480px, 90vw"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-6 lg:order-1">
              {STEPS.map((step) => (
                <div key={step.number} className="flex flex-col gap-2">
                  <span className="text-[28px] font-semibold font-heading text-sage/40">
                    {step.number}
                  </span>
                  <h3 className="text-[17px] font-semibold font-heading">{step.title}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI SEARCH */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <AiSearchSection />
        </section>

        {/* FEATURED CAREGIVERS */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <SectionHeading
            title="Meet some of our caregivers"
            description="Explore experienced caregivers and find someone who fits your family's needs."
          />
          <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Example profiles — sign in to see real, live caregivers near you
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_CAREGIVERS.map((c) => (
              <CaregiverCard
                key={c.name}
                href="/register"
                photoUrl={c.photoUrl}
                name={c.name}
                verified
                yearsExperience={c.yearsExperience}
                area={c.area}
                hourlyRate={c.hourlyRate}
                ratingAvg={c.ratingAvg}
                ratingCount={c.ratingCount}
                skills={c.skills}
              />
            ))}
          </div>
        </section>

        {/* MATCHING EXPLANATION */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <Sheet className="grid grid-cols-1 gap-8 p-8 sm:p-10 lg:grid-cols-2">
            <SectionHeading
              eyebrow="Why this match?"
              title="Matching you can actually understand."
              description="Every search is ranked using five real factors — never a black box."
            />
            <ul className="flex flex-col gap-3">
              {MATCH_REASONS.map((r) => (
                <li key={r.factor} className="flex items-center gap-3 text-[14px]">
                  <span className="text-[var(--color-success)]">✓</span>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          </Sheet>
        </section>

        {/* SAFETY */}
        <section id="safety" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col gap-5">
              <SectionHeading
                title="Because trust should never be an afterthought."
                description="CareLink is designed to protect both families and caregivers throughout the booking journey."
              />
              <ul className="flex flex-col gap-2">
                {SAFETY_ITEMS.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[14px]">
                    <span className="text-[var(--color-success)]">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div>
                <Link
                  href="#faq"
                  className="text-[14px] font-semibold text-sage hover:text-sage-hover"
                >
                  Explore our safety approach →
                </Link>
              </div>
            </div>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px]">
              <Image
                src="/demo/safety-outdoor.jpeg"
                alt="A caregiver laughing with a child outdoors"
                fill
                sizes="(min-width: 1024px) 480px, 90vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* WARD CARE PROFILE */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <SectionHeading
              title="Tell us once. CareLink remembers."
              description="Create a care profile for each child so you don't have to repeat their routine every time you book. Relevant care information is automatically available to the caregiver once a booking is made — never shared publicly."
            />
            <Sheet className="flex flex-col gap-4 overflow-hidden">
              <div className="relative -mx-6 -mt-6 aspect-[16/9]">
                <Image
                  src="/demo/ward-activity.jpeg"
                  alt="A child painting wooden shapes during a caregiving session"
                  fill
                  sizes="(min-width: 1024px) 480px, 90vw"
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Example care profile
              </p>
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-semibold font-heading">Kofi · Age 4</p>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Meals</dt>
                  <dd>No peanuts. Prefers rice dishes.</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Nap</dt>
                  <dd>1:00–2:30pm daily.</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Play</dt>
                  <dd>Loves painting and building blocks.</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Care notes</dt>
                  <dd>Mild eczema — cream in the top drawer.</dd>
                </div>
              </dl>
              <p className="text-[12px] text-ink-muted">Last updated 2 weeks ago</p>
            </Sheet>
          </div>
        </section>

        {/* CAREGIVER CTA */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <Sheet className="flex flex-col items-center gap-4 bg-peach-tint p-10 text-center">
            <SectionHeading
              title="Your experience deserves to be seen."
              description="Already part of our caregiving agency? Claim your CareLink account, share your skills and availability, and connect with families looking for childcare."
              align="center"
            />
            <LinkButton href="/claim-invitation">Claim your account →</LinkButton>
            <p className="text-[12px] text-ink-muted">
              Verification is required before receiving bookings.
            </p>
          </Sheet>
        </section>

        {/* TESTIMONIALS */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <SectionHeading title="What families are saying" align="center" />
          <p className="mx-auto mt-2 max-w-md text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Sample testimonials
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <Sheet key={t.name} className="flex flex-col gap-3">
                <div className="flex gap-0.5 text-gold">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} weight="fill" />
                  ))}
                </div>
                <p className="text-[14px] italic leading-relaxed text-ink">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-[12px] font-semibold text-ink-muted">{t.name}</p>
              </Sheet>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto w-full max-w-4xl scroll-mt-20 px-6">
          <SectionHeading title="Frequently asked questions" align="center" />
          <div className="mt-8">
            <Accordion items={FAQ_ITEMS} />
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <div className="flex flex-col items-center gap-6 rounded-[24px] bg-sage p-12 text-center">
            <h2 className="text-balance text-[28px] font-semibold text-sheet sm:text-[34px]">
              Ready to find care you can feel confident about?
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton
                href="/register"
                variant="secondary"
                className="border-none"
                style={{
                  backgroundColor: "var(--color-sheet)",
                  color: "var(--color-sage-pressed)",
                }}
              >
                Find a Caregiver →
              </LinkButton>
              <LinkButton
                href="/claim-invitation"
                variant="secondary"
                className="border-sheet/40 text-black hover:border-sheet hover:text-black"
              >
                Are you a caregiver? Join CareLink →
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
