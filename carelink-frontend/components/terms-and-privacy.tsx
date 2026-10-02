"use client";

import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// A plain in-page overlay — same "fixed inset-0" pattern the app already
// uses elsewhere for a full-screen panel — so tapping the Terms of
// Service / Privacy Policy link on the sign-up form shows the actual
// terms right there, without navigating away from registration (and
// without requiring a signed-in session to read them, which any route
// under /parent would).
export function TermsAndPrivacyOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-paper">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold font-heading text-ink">
            Terms &amp; Privacy Policy
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-sheet"
          >
            <X size={22} />
          </button>
        </div>

        <article className="flex flex-col gap-6 text-[13.5px] leading-relaxed text-ink-muted">
          <section className="flex flex-col gap-2">
            <h2 className="text-[16px] font-semibold text-ink">Terms of Service</h2>
            <p>
              CareLink connects parents in Ghana with independent, agency-verified nannies and
              babysitters. By creating an account, you agree to use CareLink only for its intended
              purpose — finding or providing childcare — and to keep the information on your account
              accurate and up to date.
            </p>
            <p>
              <strong className="text-ink">Verification.</strong> Every parent and caregiver is
              verified against a Ghana Card before they can book or accept care. CareLink may
              suspend an account where verification cannot be confirmed, or where the details
              provided don&apos;t match.
            </p>
            <p>
              <strong className="text-ink">Bookings and payment.</strong> A care session is
              confirmed once payment is completed by Mobile Money (MTN, Telecel, or AirtelTigo).
              Rates are set per caregiver type and shown in full before you pay. Cancelling a
              confirmed booking follows the cancellation terms shown at the time of booking.
            </p>
            <p>
              <strong className="text-ink">Conduct and safety.</strong> Parents and caregivers are
              expected to treat each other with respect and to keep communication within CareLink
              wherever possible. Location sharing is required for the duration of an active care
              session so CareLink and the family can confirm the caregiver&apos;s whereabouts — this
              stops automatically once the session ends.
            </p>
            <p>
              <strong className="text-ink">Liability.</strong> CareLink facilitates the booking and
              payment relationship between parents and independent caregivers; it is not itself the
              employer of any caregiver. Reports of a safety or conduct concern are reviewed by the
              CareLink team and may result in an account being suspended pending review.
            </p>
            <p>
              <strong className="text-ink">Changes.</strong> CareLink may update these terms from
              time to time. Continuing to use the app after a change means you accept the updated
              terms.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[16px] font-semibold text-ink">Privacy Policy</h2>
            <p>
              <strong className="text-ink">What we collect.</strong> Your name, phone number, email,
              and Ghana Card details (for identity verification); your child&apos;s care profile, if
              you&apos;re a parent; and, during an active care session only, the caregiver&apos;s
              live location.
            </p>
            <p>
              <strong className="text-ink">How it&apos;s used.</strong> To verify who you are, match
              parents with suitable caregivers, process Mobile Money payments, and keep everyone
              safe during a session. We don&apos;t sell your personal information to third parties.
            </p>
            <p>
              <strong className="text-ink">Who can see what.</strong> A parent and the caregiver
              assigned to their booking can see the details needed to carry out that booking —
              contact details, the care address, and the child&apos;s care profile. Your exact
              address is only shared with a caregiver once a booking is confirmed.
            </p>
            <p>
              <strong className="text-ink">Your choices.</strong> You can review and update your
              account details at any time from Settings. To request that your data be deleted,
              contact CareLink support from the Help section of the app.
            </p>
          </section>
        </article>

        <Button variant="secondary" onClick={onClose} className="self-start">
          Close
        </Button>
      </div>
    </div>
  );
}
