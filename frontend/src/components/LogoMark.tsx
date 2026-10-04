import { useId } from "react";

// The NokNok mark: a door with two "knock knock" sound waves, on the brand
// gradient. Drawn on a 64x64 grid. The same shapes are used for the favicon
// (src/app/icon.svg) and the generated app icons (src/app/icons).
export const LOGO_GRADIENT = ["#8b5cf6", "#22d3ee"] as const;
export const LOGO_DOOR = "M16 50V26a10 10 0 0 1 20 0v24z";
export const LOGO_KNOCKS = ["M41 31q4 4 0 8", "M46 26q9 9 0 18"] as const;
export const LOGO_KNOB = { cx: 31, cy: 39, r: 2.2 };

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  // Unique per instance: a gradient defined inside a hidden copy of the logo
  // (the desktop header on phones) would not paint for the visible one.
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={LOGO_GRADIENT[0]} />
          <stop offset="1" stopColor={LOGO_GRADIENT[1]} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <path d={LOGO_DOOR} fill="#fff" />
      <circle {...LOGO_KNOB} fill={LOGO_GRADIENT[0]} />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d={LOGO_KNOCKS[0]} />
        <path d={LOGO_KNOCKS[1]} opacity="0.65" />
      </g>
    </svg>
  );
}
