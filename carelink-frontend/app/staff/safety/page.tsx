import Link from "next/link";
import {
  ArrowLeft,
  Flag,
  IdentificationCard,
  MapPin,
  ShieldCheck,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import { Sheet } from "@/components/ui/sheet";

// CareLink is agency-controlled: no Emergency SOS, no self-verification
// content belongs here — a caregiver reaching this page already means
// the agency has onboarded, trained, and approved them. This page is
// content/navigation only; it doesn't touch reporting, reviews, Go
// Available, or dispatch — it just explains and links to them.
export default function StaffSafetyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-8">
      <Link
        href="/staff/profile"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Settings
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold font-heading text-ink">Safety &amp; Privacy</h1>
        <p className="text-[14px] text-ink-muted">
          Learn how CareLink helps keep you safe and protects your personal information.
        </p>
      </div>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <Flag size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Report a Parent or Booking</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Have a concern about a parent, booking, payment, inappropriate request, or another
            issue? You can report it directly to CareLink.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Open the relevant booking from your Schedule and use the Safety &amp; Support section to
            submit a report.
          </p>
          <p className="text-[12px] text-ink-muted">
            Reports are sent to CareLink administrators for review.
          </p>
        </div>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <Star size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Review a Parent</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            After a completed booking, you can share feedback about your experience with the family.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            You can leave a rating and review from the completed booking in your{" "}
            <Link
              href="/staff/schedule?from=safety"
              className="font-semibold text-wisteria hover:text-wisteria-hover"
            >
              Schedule
            </Link>
            .
          </p>
        </div>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <MapPin size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Location Privacy</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            When you choose Go Available, CareLink uses your current location to help find nearby
            care requests.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Your location is used for dispatch while you&apos;re Available for Care. It&apos;s not
            intended as continuous location tracking.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Your exact current location is not publicly shown to families.
          </p>
        </div>
      </Sheet>

      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold text-ink">Family &amp; Booking Privacy</p>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Family and booking information is private and should only be used for providing care
          through CareLink.
        </p>
        <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-muted">
          <li>
            • A family&apos;s exact care address is shared only when appropriate for the confirmed
            booking.
          </li>
          <li>• Family contact information is not publicly displayed.</li>
          <li>• Booking details are only shared with people who need them for the care service.</li>
          <li>• Do not share family information outside CareLink unnecessarily.</li>
        </ul>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <IdentificationCard size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Emergency Contact</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Your emergency contact information is kept private and is used when necessary for your
            safety.
          </p>
          <Link
            href="/staff/profile"
            className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
          >
            Manage in Settings
          </Link>
        </div>
      </Sheet>

      <Sheet className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wisteria-tint text-wisteria-pressed">
          <ShieldCheck size={20} weight="duotone" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">Your Privacy</p>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            CareLink protects your account information and limits access to information based on
            your role and booking.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
