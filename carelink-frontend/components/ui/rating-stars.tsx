import { Star } from "@phosphor-icons/react/dist/ssr";

export function RatingStars({
  rating,
  reviewCount,
}: {
  rating: number | null;
  reviewCount?: number;
}) {
  return (
    <span className="flex items-center gap-1 text-[13px] text-ink-muted">
      <Star size={14} weight="fill" className="text-gold" />
      <span className="font-semibold text-ink">{rating ? rating.toFixed(1) : "New"}</span>
      {reviewCount !== undefined && rating !== null && <span>· {reviewCount} reviews</span>}
    </span>
  );
}
