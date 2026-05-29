"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomName = exports.history = exports.MonopolyModes = void 0;
const names_json_1 = __importDefault(require("./names.json"));
exports.MonopolyModes = [
    {
        AllowDeals: true,
        WinningMode: "last-standing",
        // BuyingSystem: "following-order",
        Name: "Classic",
        startingCash: 1500,
        mortageAllowed: true,
        turnTimer: undefined,
    },
    {
        AllowDeals: false,
        WinningMode: "monopols & trains",
        // BuyingSystem: "everything",
        Name: "Monopol",
        startingCash: 1500,
        mortageAllowed: false,
        turnTimer: undefined,
    },
    {
        AllowDeals: false,
        WinningMode: "last-standing",
        // BuyingSystem: "card-firsts",
        Name: "Run-Down",
        startingCash: 1500,
        mortageAllowed: false,
        turnTimer: 30,
    },
];
function history(action) {
    const time = new Date().toJSON();
    return {
        action,
        time,
    };
}
exports.history = history;
function randomName() {
    return names_json_1.default[Math.floor(Math.random() * names_json_1.default.length)];
}
exports.randomName = randomName;
