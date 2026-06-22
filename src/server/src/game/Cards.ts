/**
 * @file Cards.ts
 * @description Server-authoritative Chance and Community Chest deck drawers.
 */

import monopolyJSON from "../../../shared/data/monopoly.json";

/**
 * Metadata schema defining a Chance or Community Chest card action.
 */
export interface Card {
    /** Text message displayed to the player */
    title: string;
    /** Code action key (e.g. "move", "pay", "collect", "jail") */
    action: string;
    /** Cash amount to gain or lose */
    amount?: number;
    /** Board tile ID target (e.g. "boardwalk", "go") */
    tileid?: string;
    /** Counter values (e.g. number of spaces to move) */
    count?: number;
    /** Group ID category target (e.g. "Railroad", "Utilities") */
    groupid?: string;
    /** Rent multiplier factor if landing on utility/railroad */
    rentmultiplier?: number;
    /** Cost per house if card assesses repairs */
    buildings?: number;
    /** Cost per hotel if card assesses repairs */
    hotels?: number;
    /** Sub-action code (e.g. "getout" for jail cards) */
    subaction?: string;
}

/**
 * Draws a random card from the Chance card deck.
 *
 * @param excludeGetOut Whether to ignore "Get Out of Jail Free" cards (e.g. if already drawn)
 * @returns Drawn Card object
 */
export function drawChanceCard(excludeGetOut = false): Card {
    const deck = monopolyJSON.chance as Card[];
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}

/**
 * Draws a random card from the Community Chest card deck.
 *
 * @param excludeGetOut Whether to ignore "Get Out of Jail Free" cards (e.g. if already drawn)
 * @returns Drawn Card object
 */
export function drawCommunityChestCard(excludeGetOut = false): Card {
    const deck = (monopolyJSON as any).communitychest as Card[];
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}
