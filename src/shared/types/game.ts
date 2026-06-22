/**
 * @file game.ts
 * @description Shared type definitions, constants, and utility helpers for the Monopoly game state, rules, cookie storage, and statistics tracking.
 */

/**
 * Defines the type of engine used for rendering the board: 2D Canvas or 3D WebGL.
 */
export type EngineSettings = "2d" | "3d";

/**
 * Settings configuration for a client session.
 */
export type MonopolySettings = {
    gameEngine: EngineSettings;
    /** Accessibility settings array: [rotationSpeed, zoomScale, showIds, enableSpeech, showColorBadges] */
    accessibility: [number, number, boolean, boolean, boolean];
    /** Audio volume settings: [masterVolume, soundEffectsVolume, musicVolume] */
    audio: [number, number, number];
    /** Whether desktop notifications are enabled */
    notifications: boolean;
    /** Whether debug logs are displayed in developer console */
    debugEnabled?: boolean;
};

/**
 * Schema representing the cached Monopoly cookies.
 */
export type MonopolyCookie = {
    login: {
        id: string;
        remember: boolean;
    };
    settings?: MonopolySettings;
};

/**
 * Schema representing basic authenticated user metadata.
 */
export interface User {
    id: string;
    email: string;
    name: string;
    score: 0;
}

/**
 * Configuration schema for custom or pre-set game rule configurations.
 */
export interface MonopolyMode {
    WinningMode: "last-standing" | "monopols" | "monopols & trains";
    AllowDeals: boolean;
    Name: string;
    startingCash: number;
    mortageAllowed: boolean;
    turnTimer: undefined | number;
    allowAuctions: boolean;
}

/**
 * Built-in standard presets for the Monopoly game modes.
 */
export const MonopolyModes: MonopolyMode[] = [
    {
        AllowDeals: true,
        WinningMode: "last-standing",
        Name: "Classic",
        startingCash: 1500,
        mortageAllowed: true,
        turnTimer: undefined,
        allowAuctions: true,
    },
    {
        AllowDeals: false,
        WinningMode: "monopols & trains",
        Name: "Monopol",
        startingCash: 1500,
        mortageAllowed: false,
        turnTimer: undefined,
        allowAuctions: true,
    },
    {
        AllowDeals: false,
        WinningMode: "last-standing",
        Name: "Run-Down",
        startingCash: 1500,
        mortageAllowed: false,
        turnTimer: 30,
        allowAuctions: true,
    },
];

/**
 * Schema for an individual property owned by a player.
 */
export interface PlayerProprety {
    posistion: number;
    /** Number of houses built (1-4) or hotel ("h"), 0 means unimproved */
    count: 0 | 1 | 2 | 3 | 4 | "h";
    group: string;
    rent?: number;
    morgage?: boolean;
}

/**
 * Represents a historical action committed to the game log.
 */
export interface historyAction {
    time: string;
    action: string;
    /** Snapshot of player balances at the time of this action */
    balances?: Array<{ username: string; balance: number; color: string }>;
}

/**
 * Factory helper to construct a new historyAction log.
 * Corrects common typos like "payed" to "paid".
 *
 * @param action Description of the event
 * @param balances Optional snapshot of player balances
 * @returns A formatted historyAction object
 */
export function history(
    action: string,
    balances?: Array<{ username: string; balance: number; color: string }>,
): historyAction {
    const time = new Date().toJSON();
    return {
        action: action
            .replace(/\s+/g, " ")
            .replace(/\bpayed\b/gi, "paid")
            .trim(),
        time,
        balances,
    } as historyAction;
}

/**
 * Represents a pending or finalized trading proposal between two players.
 */
export type GameTrading = {
    turnPlayer: {
        id: string;
        balance: number;
        prop: PlayerProprety[];
        accepted: boolean;
    };
    againstPlayer: {
        id: string;
        balance: number;
        prop: PlayerProprety[];
        accepted: boolean;
    };
};

/**
 * Statistics tracked per player for analytical insights drawers.
 */
export interface PlayerStats {
    totalGained: number;
    totalLost: number;
    rentPaid: number;
    rentReceived: number;
    taxesPaid: number;
    netWorthHistory: Array<{ turn: number; netWorth: number }>;
    doublesRolled: number;
    goodCardsDrawn: number;
    badCardsDrawn: number;
    jailCount: number;
    luckyEvents: number;
    unluckyEvents: number;
    cumulativeLuck: number;
    luckEventsCount: number;
}

/**
 * Global game statistics containing dice distributions and tile visit patterns.
 */
export interface GameStats {
    /** Frequency map of dice sum totals (e.g. { '7': 12 }) */
    diceRolls: Record<number, number>;
    /** Frequency map of visits per board tile position (0-39) */
    tileVisits: Record<number, number>;
    /** Stats mapped per player socket connection ID */
    playerStats: Record<string, PlayerStats>;
}
