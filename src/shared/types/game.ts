export type EngineSettings = "2d" | "3d";

export type MonopolySettings = {
    gameEngine: EngineSettings;
    accessibility: [number, number, boolean, boolean, boolean];
    audio: [number, number, number];
    notifications: boolean;
    debugEnabled?: boolean;
};

export type MonopolyCookie = {
    login: {
        id: string;
        remember: boolean;
    };
    settings?: MonopolySettings;
};

export interface User {
    id: string;
    email: string;
    name: string;
    score: 0;
}

export interface MonopolyMode {
    WinningMode: "last-standing" | "monopols" | "monopols & trains";
    AllowDeals: boolean;
    Name: string;
    startingCash: number;
    mortageAllowed: boolean;
    turnTimer: undefined | number;
    allowAuctions: boolean;
}

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

export interface PlayerProprety {
    posistion: number;
    count: 0 | 1 | 2 | 3 | 4 | "h";
    group: string;
    rent?: number;
    morgage?: boolean;
}

export interface historyAction {
    time: string;
    action: string;
    balances?: Array<{ username: string; balance: number; color: string }>;
}

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

export interface GameStats {
    diceRolls: Record<number, number>;
    tileVisits: Record<number, number>;
    playerStats: Record<string, PlayerStats>;
}
