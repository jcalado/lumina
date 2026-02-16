export default function AlbumLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb skeleton */}
      <div className="h-6 w-48 bg-muted rounded animate-pulse" />

      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-64 bg-muted rounded animate-pulse" />
        <div className="h-5 w-96 bg-muted rounded animate-pulse" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  );
}
