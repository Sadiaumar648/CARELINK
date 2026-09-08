import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck,
  LockKey,
  ChatCircleText,
  SealCheck,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import { LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SectionHeading } from "@/components/ui/section-heading";
import { Avatar } from "@/components/ui/avatar";
import { Accordion } from "@/components/ui/accordion";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";

const TRUST_FEATURES = [
  {
    icon: ShieldCheck,
    title: "Agency-trained & verified",
    body: "Caregivers are trained by the agency and verified through CareLink before joining the platform.",
  },
  {
    icon: LockKey,
    title: "Secure booking",
    body: "Clear booking details, secure payments and records for every care session.",
  },
  {
    icon: ChatCircleText,
    title: "Real reviews",
    body: "Parents and caregivers can leave reviews after completed bookings.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Tell us what you need",
    body: "Choose a nanny or babysitter, tell us when you need care, and share your care location.",
  },
  {
    number: "02",
    title: "We find your match",
    body: "CareLink finds suitable agency caregivers near your location. If you have a preferred caregiver, we’ll try them first.",
  },
  {
    number: "03",
    title: "Confirm your booking",
    body: "Once a caregiver accepts, review your booking details, pay securely, and your care is confirmed.",
  },
];

const DEMO_CAREGIVERS = [
  {
    name: "Ama Mensah",
    photoUrl: "/demo/ama-mensah.jpeg",
    yearsExperience: 5,
    careType: "Nanny",
    area: "East Legon",
  },
  {
    name: "Efua Owusu",
    photoUrl: "/demo/efua-owusu.jpeg",
    yearsExperience: 3,
    careType: "Babysitter",
    area: "Osu",
  },
  {
    name: "Maame Ama",
    photoUrl: "/demo/maame-ama.jpeg",
    yearsExperience: 7,
    careType: "Nanny",
    area: "Airport Residential",
  },
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
              <h1 className="text-balance text-[38px] font-semibold leading-[1.15] sm:text-[48px]">
                Trusted care, closer to home.
              </h1>
              <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">
                Tell us what you need and your location, and CareLink will find a suitable nanny or
                babysitter for you from our trusted agency caregivers. We handle the search, so you
                can focus on what matters most.
              </p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[13px] text-ink-muted">
                <li className="flex items-center gap-1.5">
                  <span className="text-[var(--color-success)]">✓</span> Trained and verified by
                  CareLink
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
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
            {TRUST_FEATURES.map((f) => (
              <Sheet key={f.title} className="flex flex-col gap-3">
                <f.icon size={26} weight="duotone" className="text-wisteria" />
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
                  <span className="text-[28px] font-semibold font-heading text-wisteria/40">
                    {step.number}
                  </span>
                  <h3 className="text-[17px] font-semibold font-heading">{step.title}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CAREGIVER PROFILES */}
        <section className="mx-auto w-full max-w-6xl px-6">
          <SectionHeading
            title="Trusted caregivers, ready to care."
            description="CareLink works with agency-trained caregivers who are verified before they can receive care requests."
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_CAREGIVERS.map((c) => (
              <Sheet key={c.name} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar photoUrl={c.photoUrl} name={c.name} size="sm" />
                    <div>
                      <p className="text-[16px] font-semibold font-heading">{c.name}</p>
                      <p className="text-[13px] text-ink-muted">Agency-trained caregiver</p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-tint px-3 py-1 text-[12px] font-semibold text-[var(--color-success)]">
                    <SealCheck size={14} weight="fill" />
                    CareLink verified
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-t border-hairline pt-4 text-[13px] text-ink-muted">
                  <p>{c.yearsExperience} years of experience</p>
                  <p>{c.careType}</p>
                  <p>Serves {c.area} & nearby areas</p>
                </div>
              </Sheet>
            ))}
          </div>
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
                  className="text-[14px] font-semibold text-wisteria hover:text-wisteria-hover"
                >
                  Explore our safety approach
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
            <LinkButton href="/claim-invitation">Claim your account</LinkButton>
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
          <div className="flex flex-col items-center gap-6 rounded-[24px] bg-wisteria p-12 text-center">
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
                  color: "var(--color-wisteria-pressed)",
                }}
              >
                Find a Caregiver
              </LinkButton>
              <LinkButton
                href="/claim-invitation"
                variant="secondary"
                className="border-sheet/40 text-black hover:border-sheet hover:text-black"
              >
                Are you a caregiver? Join CareLink
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
