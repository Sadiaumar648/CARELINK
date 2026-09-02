export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : ""}`}>
      {eyebrow && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-wisteria">
          {eyebrow}
        </span>
      )}
      <h2 className="text-balance text-[28px] font-semibold leading-snug sm:text-[32px]">
        {title}
      </h2>
      {description && (
        <p
          className={`text-[15px] leading-relaxed text-ink-muted ${align === "center" ? "max-w-[60ch]" : "max-w-[65ch]"}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
