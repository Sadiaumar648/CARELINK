// A short "how fresh is this" label for a live-updating value (SafeTrack
// location) — deliberately coarser than message-time.ts's "Today, 3:41 PM"
// style, since this only ever needs to answer "is this current?".
export function minutesAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
}
