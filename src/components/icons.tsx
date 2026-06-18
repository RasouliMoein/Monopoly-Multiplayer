// Centralised SVG icon library — no emoji, no external dependencies.
// Usage: <Icons.Dice className="..." style={...} />

import React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

export const Icons = {

    // ── Game actions ─────────────────────────────────────────────────────────

    Dice: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="2" y="2" width="20" height="20" rx="4"/>
            <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
    ),

    EndTurn: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <polyline points="9 18 15 12 9 6"/>
            <line x1="15" y1="6" x2="15" y2="18"/>
        </svg>
    ),

    Bankruptcy: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
    ),

    // ── Lobby icons ──────────────────────────────────────────────────────────

    Crown: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M2 19h20M2 19l3-9 4.5 4.5L12 5l2.5 9.5L19 10l3 9"/>
        </svg>
    ),

    Trophy: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M8 21h8M12 17v4M7 4H4a2 2 0 0 0-2 2v1c0 2.2 1.5 4 3.5 4.5M17 4h3a2 2 0 0 1 2 2v1c0 2.2-1.5 4-3.5 4.5"/>
            <path d="M7 4h10v7a5 5 0 0 1-10 0V4z"/>
        </svg>
    ),

    Handshake: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="m11 17 2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0L12 16" />
            <path d="m13 14-3-3a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0L11 13" />
            <path d="m18 22 4-4a1.5 1.5 0 0 0 0-2.1l-4.6-4.6a1.5 1.5 0 0 0-2.1 0L13 14" />
            <path d="M2 18 6 14a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L9 22" />
        </svg>
    ),

    Building: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="9" y1="22" x2="9" y2="16" />
            <line x1="15" y1="22" x2="15" y2="16" />
            <line x1="9" y1="16" x2="15" y2="16" />
            <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M12 6h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
        </svg>
    ),

    Coin: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v2M12 16v2M9 9h4a2 2 0 0 1 0 4H9M15 9a2 2 0 0 1 0 4"/>
        </svg>
    ),

    Timer: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <circle cx="12" cy="13" r="9"/>
            <polyline points="12 9 12 13 15 16"/>
            <path d="M9 2h6"/>
        </svg>
    ),

    // ── Debug panel ──────────────────────────────────────────────────────────

    Wrench: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
    ),

    DebtTrigger: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
        </svg>
    ),

    ForceTurn: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
    ),

    ArrowUp: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
        </svg>
    ),

    ArrowDown: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
        </svg>
    ),

    Scale: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <line x1="12" y1="3" x2="12" y2="21"/>
            <path d="M5 6H2l3 9a5 5 0 0 0 10 0l3-9h-3"/>
            <path d="M22 6H19l3 9a5 5 0 0 1-10 0l3-9H12"/>
        </svg>
    ),

    // ── Join / room list ─────────────────────────────────────────────────────

    Antenna: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M12 20V10"/>
            <path d="M6.33 16.67a8 8 0 0 1 0-9.34"/>
            <path d="M17.67 16.67a8 8 0 0 0 0-9.34"/>
            <path d="M3.34 20a14 14 0 0 1 0-16"/>
            <path d="M20.66 20a14 14 0 0 0 0-16"/>
            <circle cx="12" cy="10" r="2"/>
        </svg>
    ),

    Users: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    ),

    MapPin: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
        </svg>
    ),

    Zap: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
    ),

    // ── Property tab ─────────────────────────────────────────────────────────

    Unlock: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
        </svg>
    ),

    Lock: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
    ),

    Home: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
    ),

    // ── History / nav feed ───────────────────────────────────────────────────

    DollarSign: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
    ),

    Jail: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="8" y1="3" x2="8" y2="21"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
            <line x1="16" y1="3" x2="16" y2="21"/>
        </svg>
    ),

    Police: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z" />
            <polygon points="12 8 13.5 11.5 17 11.5 14 13.5 15.5 17 12 15 8.5 17 10 13.5 7 11.5 10.5 11.5" stroke="currentColor" strokeWidth={1} fill="currentColor" />
        </svg>
    ),

    CardDraw: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
    ),

    Flag: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
    ),

    Check: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <polyline points="20 6 9 17 4 12"/>
        </svg>
    ),

    Skull: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M12 2a9 9 0 0 1 9 9c0 3.5-2 6.5-5 8v1H8v-1c-3-1.5-5-4.5-5-8a9 9 0 0 1 9-9z"/>
            <line x1="8" y1="22" x2="16" y2="22"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <circle cx="9.5" cy="11.5" r="1.5"/>
            <circle cx="14.5" cy="11.5" r="1.5"/>
        </svg>
    ),

    Package: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
    ),

    ClipBoard: (p: IconProps) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
    ),
};

export default Icons;
