const PATHS = {
  bowl: 'M4 14h16a8 8 0 0 1-8 6 8 8 0 0 1-8-6ZM12 4v3',
  cook: 'M4 13h16a8 8 0 0 1-16 0ZM12 4v3',
  book: 'M4 5.5h7v13H4zM13 5.5h7v13h-7z',
  calendar: 'M4 6.5h16v13H4zM4 10.5h16M9 4v3M15 4v3',
  shelf: 'M4 5h16v14H4zM12 5v14M4 12h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevronLeft: 'M14 6l-6 6 6 6',
  chevronRight: 'M10 6l6 6-6 6',
  check: 'M4 12.5 9.5 18 20 6.5',
  search: 'M16 16l4.5 4.5',
  bag: 'M5 7h14l-1.3 11a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8ZM9 7V5.5a3 3 0 0 1 6 0V7',
  trash: 'M5 7h14M9 7V5.5h6V7M7 7l1 12.5h8L17 7',
  key: 'M9 13v7l2-2 2 2M15 7h5M15 11h3',
  sun: 'M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  clock: 'M12 9.5V13l2.5 1.5',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * Iconos de trazo, en línea, con `currentColor`.
 * Si sustituyes este set por otro, mantén los grosores (1.8–2.6).
 */
export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      {name === 'search' && <circle cx="11" cy="11" r="6.5" />}
      {name === 'key' && <circle cx="9" cy="9" r="4" />}
      {name === 'clock' && <circle cx="12" cy="13" r="8" />}
      {name === 'sun' && <circle cx="12" cy="12" r="3" />}
      <path d={PATHS[name]} />
    </svg>
  );
}
