/** Thin line icons (24px grid, 1.6 stroke) for navigation. Decorative: always aria-hidden. */
const paths: Record<string, string> = {
  markets: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  trade: "M7 7h13l-4-4M17 17H4l4 4",
  hedge: "M3 17h6l6-10h6M3 21h18",
  portfolio: "M4 7h16v13H4zM9 7V4h6v3M4 12h16",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  vault: "M4 4h16v16H4zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9V7M15 12h2",
  futures: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  admin: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  docs: "M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={paths[name]} />
    </svg>
  );
}
