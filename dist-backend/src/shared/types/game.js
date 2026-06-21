"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.history = exports.MonopolyModes = void 0;
exports.MonopolyModes = [
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
function history(action, balances) {
    const time = new Date().toJSON();
    return {
        action: action.replace(/\s+/g, " ").replace(/\bpayed\b/gi, "paid").trim(),
        time,
        balances,
    };
}
exports.history = history;
