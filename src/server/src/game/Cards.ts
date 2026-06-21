import monopolyJSON from "../../../shared/data/monopoly.json";

export interface Card {
    title: string;
    action: string;
    amount?: number;
    tileid?: string;
    count?: number;
    groupid?: string;
    rentmultiplier?: number;
    buildings?: number;
    hotels?: number;
    subaction?: string;
}

export function drawChanceCard(excludeGetOut = false): Card {
    const deck = monopolyJSON.chance as Card[];
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}

export function drawCommunityChestCard(excludeGetOut = false): Card {
    const deck = (monopolyJSON as any).communitychest as Card[];
    let card = deck[Math.floor(Math.random() * deck.length)];
    if (excludeGetOut && card.action === "jail" && card.subaction === "getout") {
        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
        card = filtered[Math.floor(Math.random() * filtered.length)];
    }
    return card;
}
