/**
 * Skeleton loader (JEMAW_PLAN.md §12.9): shapes match the final silhouette; a
 * linear gradient sweeps left-to-right over 1.2s. No spinners anywhere.
 */
export function Skeleton({
  height = 56,
  radius = "var(--r-md)",
}: {
  height?: number;
  radius?: string;
}) {
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--surface) 0%, var(--surface-elevated) 50%, var(--surface) 100%)",
        backgroundSize: "200% 100%",
        animation: "jemaw-shimmer 1.2s linear infinite",
      }}
    />
  );
}

/** A list of skeleton rows matching a card/list layout. */
export function SkeletonList({
  count = 3,
  height = 56,
  radius = "var(--r-lg)",
}: {
  count?: number;
  height?: number;
  radius?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8, padding: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius={radius} />
      ))}
      <style>{`@keyframes jemaw-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }`}</style>
    </div>
  );
}
