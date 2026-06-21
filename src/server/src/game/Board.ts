import monopolyJSON from "../../../shared/data/monopoly.json";
import { Player } from "./Player";

export const propertyByPosition = new Map<number, any>(monopolyJSON.properties.map((p) => [p.posistion ?? 0, p]));

export const propertyById = new Map<string, any>(monopolyJSON.properties.map((p) => [p.id ?? "", p]));

export const CARD_TILES = new Set(["communitychest", "chance"]);
export const INERT_TILES = new Set(["go", "jail", "freeparking"]);

/**
 * Compute rent owed at a position (server-authoritative).
 * Returns { owner, amount }; amount=0 when mortgaged or unowned.
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
            if (prp.posistion !== position) continue;
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
