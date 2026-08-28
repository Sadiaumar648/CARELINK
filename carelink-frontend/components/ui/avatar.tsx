import { User } from "@phosphor-icons/react/dist/ssr";

const SIZES = { sm: "h-12 w-12", md: "h-20 w-20", lg: "h-32 w-32" } as const;

export function Avatar({
  photoUrl,
  name,
  size = "sm",
  className = "",
}: {
  photoUrl: string | null;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const sizeClass = SIZES[size];
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a public storage URL, not a static asset
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-pressed ${className}`}
      aria-hidden
    >
      <User size={size === "lg" ? 56 : size === "md" ? 36 : 22} weight="duotone" />
    </div>
  );
}
