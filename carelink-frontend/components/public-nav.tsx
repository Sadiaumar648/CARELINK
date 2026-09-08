import Link from "next/link";
import { LinkButton } from "@/components/ui/button";

// Simplified, minimal public header: logo on the left, Log in / Get
// Started on the right — no navigation links. Previously listed Home,
// Find Care, How It Works, Safety, About and Become a Caregiver here;
// removed per the finalized minimal header direction. No mobile menu is
// needed anymore since there's nothing left to collapse — both actions
// stay visible at every width.
export function PublicNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-sheet/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="text-[19px] font-semibold font-heading text-wisteria-pressed">
          CareLink
        </a>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/sign-in"
            className="px-2 text-[14px] font-semibold text-ink hover:text-wisteria"
          >
            Log in
          </Link>
          <LinkButton href="/register" size="default">
            Get Started
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
