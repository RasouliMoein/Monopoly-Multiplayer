/**
 * @file Board.ts
 * @description Server-authoritative utility mappings of board coordinates and helper functions to calculate property rent payouts dynamically.
 */

import monopolyJSON from "../../../shared/data/monopoly.json";
import { Player } from "./Player";

/**
 * Fast lookup map index grouping board property configurations by their tile board index (0-39).
 */
export const propertyByPosition = new Map<number, any>(monopolyJSON.properties.map((p) => [p.position ?? 0, p]));

/**
 * Fast lookup map index grouping board property configurations by their unique JSON string ID.
 */
export const propertyById = new Map<string, any>(monopolyJSON.properties.map((p) => [p.id ?? "", p]));

/**
 * Set containing tile IDs corresponding to card decks (Chance and Community Chest).
 */
export const CARD_TILES = new Set(["communitychest", "chance"]);

/**
 * Set containing tile IDs that do not trigger purchases or actions.
 */
export const INERT_TILES = new Set(["go", "jail", "freeparking"]);

/**
 * Compute rent owed at a position (server-authoritative).
 * Handles monopolies (double rent on unimproved color groups), houses/hotels, utilities (dice rolls factor), and railroads.
 * Returns { owner, amount }; amount is 0 if mortgaged or unowned.
 *
 * @param position Board coordinate (0-39) being evaluated
 * @param rolls Total sum of the dice rolled in the current turn
 * @param players Active players list in the room lobby
 * @param multiplier Optional multiplier factor (e.g. from Chance card events)
 * @returns Object indicating the owner (if any) and the exact rent amount owed
 */
export function computeRent(
    position: number,
    rolls: number,
    players: Player[],
    multiplier = 1,
): { owner: Player | null; amount: number } {
    const prop = propertyByPosition.get(position);
    if (!prop) return { owner: null, amount: 0 };

    for (const player of players) {
        for (const prp of player.properties) {
            if (prp.position !== position) continue;
            if (prp.morgage === true) return { owner: player, amount: 0 };

            let amt = 0;
            if (prop.group === "Utilities") {
                const cnt = player.properties.filter((p: any) => p.group === "Utilities").length;
                const baseRate = multiplier === 10 ? 1 : cnt === 2 ? 10 : 4;
                amt = rolls * baseRate * multiplier;
            } else if (prop.group === "Railroad") {
                const cnt = player.properties.filter((p: any) => p.group === "Railroad").length;
                amt = ([0, 25, 50, 100, 200][cnt] ?? 0) * multiplier;
            } else if (prp.count === 0) {
                const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prop.group);
                const ownedGroup = player.properties.filter((p: any) => p.group === prop.group);
                const hasMonopoly = groupProps.length > 0 && ownedGroup.length === groupProps.length;
                const allUnimproved = ownedGroup.every((p: any) => p.count === 0);
                const noneMortgaged = ownedGroup.every((p: any) => p.morgage !== true && (p.morgage as any) !== "true");
                amt = (prop.rent ?? 0) * (hasMonopoly && allUnimproved && noneMortgaged ? 2 : 1) * multiplier;
            } else if (typeof prp.count === "number" && prp.count > 0) {
                amt = ((prop.multpliedrent ?? [])[prp.count - 1] ?? 0) * multiplier;
            } else if (prp.count === "h") {
                amt = ((prop.multpliedrent ?? [])[4] ?? 0) * multiplier;
            }
            return { owner: player, amount: amt };
        }
    }
    return { owner: null, amount: 0 };
}
