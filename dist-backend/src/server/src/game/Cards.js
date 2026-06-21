"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawCommunityChestCard = exports.drawChanceCard = void 0;
const monopoly_json_1 = __importDefault(require("../../../shared/data/monopoly.json"));
function drawChanceCard(excludeGetOut = false) {
    const deck = monopoly_json_1.default.chance;
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}
exports.drawChanceCard = drawChanceCard;
function drawCommunityChestCard(excludeGetOut = false) {
    const deck = monopoly_json_1.default.communitychest;
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}
exports.drawCommunityChestCard = drawCommunityChestCard;
