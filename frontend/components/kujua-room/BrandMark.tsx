/**
 * The Kujua Room mark.
 *
 * Two deliberate departures from the old violet disc with a serif K in it.
 * The plate is a rounded square, because a violet circle holding a letter was
 * indistinguishable from a participant avatar — the room draws those as
 * coloured circles with initials, so the brand was wearing its users' clothes.
 * And the K is replaced by three level bars, the same meter the microphone
 * test draws, which says "live voice" at 24px where a letterform says only
 * that a word starts with K.
 *
 * Heights are uneven on purpose: a symmetric meter reads as an icon of a
 * meter, an uneven one reads as a voice actually moving it.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-mark-svg ${className}`.trim()}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Kujua Room"
    >
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <g fill="var(--on-accent)">
        <rect x="11" y="15" width="4" height="10" rx="2" />
        <rect x="18" y="10" width="4" height="20" rx="2" />
        <rect x="25" y="13.5" width="4" height="13" rx="2" />
      </g>
    </svg>
  );
}
