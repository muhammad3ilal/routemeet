export default function BrandMark({ size = 42 }) {
  const iconSize = Math.round(size * 0.55);
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.28 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={iconSize} height={iconSize}>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" fill="white" stroke="none" />
      </svg>
    </span>
  );
}
