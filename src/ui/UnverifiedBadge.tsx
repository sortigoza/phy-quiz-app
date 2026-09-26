/** Marks an attempt that arrived by import: this browser cannot check it is genuine. */
export function UnverifiedBadge() {
  return (
    <span
      className="badge badge--unverified"
      title="Imported from a file: this browser cannot check it is genuine"
    >
      Unverified
    </span>
  );
}
