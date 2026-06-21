"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRent = exports.INERT_TILES = exports.CARD_TILES = exports.propertyById = exports.propertyByPosition = void 0;
const monopoly_json_1 = __importDefault(require("../../../shared/data/monopoly.json"));
exports.propertyByPosition = new Map(monopoly_json_1.default.properties.map((p) => [p.posistion ?? 0, p]));
exports.propertyById = new Map(monopoly_json_1.default.properties.map((p) => [p.id ?? "", p]));
exports.CARD_TILES = new Set(["communitychest", "chance"]);
exports.INERT_TILES = new Set(["go", "jail", "freeparking"]);
/**
 * Compute rent owed at a position (server-authoritative).
 * Returns { owner, amount }; amount=0 when mortgaged or unowned.
 */
function computeRent(position, rolls, players, multiplier = 1) {
    const prop = exports.propertyByPosition.get(position);
    if (!prop)
        return { owner: null, amount: 0 };
    for (const player of players) {
        for (const prp of player.properties) {
            if (prp.posistion !== position)
                continue;
            if (prp.morgage === true)
                return { owner: player, amount: 0 };
            let amt = 0;
            if (prop.group === "Utilities") {
                const cnt = player.properties.filter((p) => p.group === "Utilities").length;
                const baseRate = multiplier === 10 ? 1 : cnt === 2 ? 10 : 4;
                amt = rolls * baseRate * multiplier;
            }
            else if (prop.group === "Railroad") {
                const cnt = player.properties.filter((p) => p.group === "Railroad").length;
                amt = ([0, 25, 50, 100, 200][cnt] ?? 0) * multiplier;
            }
            else if (prp.count === 0) {
                const groupProps = monopoly_json_1.default.properties.filter((p) => p.group === prop.group);
                const ownedGroup = player.properties.filter((p) => p.group === prop.group);
                const hasMonopoly = groupProps.length > 0 && ownedGroup.length === groupProps.length;
                const allUnimproved = ownedGroup.every((p) => p.count === 0);
                const noneMortgaged = ownedGroup.every((p) => p.morgage !== true && p.morgage !== "true");
                amt = (prop.rent ?? 0) * (hasMonopoly && allUnimproved && noneMortgaged ? 2 : 1) * multiplier;
            }
            else if (typeof prp.count === "number" && prp.count > 0) {
                amt = ((prop.multpliedrent ?? [])[prp.count - 1] ?? 0) * multiplier;
            }
            else if (prp.count === "h") {
                amt = ((prop.multpliedrent ?? [])[4] ?? 0) * multiplier;
            }
            return { owner: player, amount: amt };
        }
    }
    return { owner: null, amount: 0 };
}
exports.computeRent = computeRent;
