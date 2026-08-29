export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-hairline/60 ${className}`} aria-hidden />;
}

export function WardCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-hairline bg-sheet p-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-3 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function CaregiverCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-hairline bg-sheet p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function BookingCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-[18px] border border-hairline bg-sheet p-5">
      <Skeleton className="h-14 w-14 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

export function ConversationCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-hairline bg-sheet p-4">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  );
}
