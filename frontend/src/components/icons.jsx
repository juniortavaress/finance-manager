/* Ícones SVG portados do mock original (stroke, viewBox 24x24) */

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };

export const IconDashboard = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconBank = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 10L12 4l9 6" />
    <path d="M5 10v9h14v-9" />
    <path d="M10 19v-6h4v6" />
  </svg>
);

export const IconSwap = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M7 7h13l-3-3M17 17H4l3 3" />
  </svg>
);

export const IconInstallments = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <rect x="3" y="10" width="18" height="4" rx="1" />
    <rect x="3" y="16" width="10" height="4" rx="1" />
  </svg>
);

export const IconCard = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
  </svg>
);

export const IconGrid = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconTrendUp = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const IconWallet = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 7a2 2 0 012-2h13a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <path d="M16 12h3" />
    <path d="M3 8h18" />
  </svg>
);

export const IconCoin = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.2c0-1.2 1.1-2.2 2.5-2.2s2.5.9 2.5 2c0 3-5 1.7-5 4.6 0 1.1 1.1 2 2.5 2s2.5-1 2.5-2.2" />
  </svg>
);

export const IconChart = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M4 20V10M12 20V4M20 20v-7" />
  </svg>
);

export const IconGear = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

export const IconUser = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c1.5-4 5-5.5 7-5.5s5.5 1.5 7 5.5" />
  </svg>
);

export const IconLogout = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconPencil = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
  </svg>
);

export const IconInfo = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrash = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconArchive = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <rect x="3" y="3" width="18" height="5" rx="1.5" />
    <path d="M5 8v11a2 2 0 002 2h10a2 2 0 002-2V8" />
    <path d="M10 13h4" />
  </svg>
);

export const IconEye = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.2A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17.5 17.5 0 01-3.2 4.2M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 004.4-1" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </svg>
);

export const IconChevronDown = (props) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M12 9v4" />
    <path d="M10.3 3.9L1.9 18a2 2 0 001.7 3h16.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 17h.01" />
  </svg>
);

export const IconClock = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

export const IconRepeat = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
);

export const IconBell = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 003.4 0" />
  </svg>
);

export const IconMenu = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const IconUsers = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <circle cx="8.5" cy="8" r="3.2" />
    <path d="M2.5 20c1.2-3.5 4-5 6-5s4.8 1.5 6 5" />
    <circle cx="17" cy="8.5" r="2.6" />
    <path d="M15.5 4.6a2.6 2.6 0 010 7.8" />
    <path d="M15.8 15c1.9.4 3.8 1.8 4.7 5" />
  </svg>
);

export const IconClose = (props) => (
  <svg viewBox="0 0 24 24" {...base} {...props}>
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
);
