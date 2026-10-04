export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-xl ${className}`} />;
}

export function ActivityCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`glass-card overflow-hidden rounded-3xl ${className}`}>
      <Skeleton className="h-52 rounded-none md:h-60" />
      <div className="space-y-3 p-4 md:p-5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
