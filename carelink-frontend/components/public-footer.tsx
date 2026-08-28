import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Find Care", href: "#find-care" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Become a Caregiver", href: "/claim-invitation" },
    ],
  },
  {
    title: "Safety",
    links: [
      { label: "Verification", href: "#safety" },
      { label: "Safety Center", href: "#safety" },
      { label: "Report an Issue", href: "/sign-in" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#about" },
      { label: "FAQs", href: "#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-hairline bg-sheet">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-6 py-16 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <span className="text-[19px] font-semibold font-heading text-sage-pressed">CareLink</span>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Trusted care, closer to home.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {col.title}
            </h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-[14px] text-ink hover:text-sage">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-hairline px-6 py-6 text-center text-[13px] text-ink-muted">
        © 2026 CareLink
      </div>
    </footer>
  );
}
