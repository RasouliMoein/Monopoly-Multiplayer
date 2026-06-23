/**
 * @file GameState.ts
 * @description Core authoritative server game state machine for managing player connections, board movements, card resolutions, auctions, trades, and bankruptcy resolution.
 */

import { Player } from "./Player";
import { computeRent, propertyByPosition, propertyById, CARD_TILES, INERT_TILES } from "./Board";
import monopolyJSON from "../../../shared/data/monopoly.json";
import { GameTrading, MonopolyMode, MonopolyModes, historyAction, GameStats } from "../../../shared/types/game";

/**
 * Authoritative game state machine containing the complete active game state, player list, logs, statistics, and rules engine.
 */
export class GameState {
    public clients = new Map<
        string,
        {
            player: Player;
            socket: any;
            ready: boolean;
            positions: { x: number; y: number };
            connected?: boolean;
            isDebugAuthenticated?: boolean;
        }
    >();
    public spectators = new Map<string, any>();
    public logs_strings: Array<string> = [];
    public currentId = "";
    public gameStarted = false;
    public selectedMode: MonopolyMode = MonopolyModes[0];
    public hostId = "";
    public disconnectGracePeriodTimers = new Map<string, any>();

    // Persistent game history & statistics storage
    public server_histories: Array<historyAction> = [];
    public gameStats: GameStats = {
        diceRolls: {},
        tileVisits: {},
        playerStats: {},
    };

    // Tracking maps
    public consecutiveDoublesMap = new Map<string, number>();
    public creditorMap = new Map<string, string | "bank" | null>();
    public debugDiceOverrideMap = new Map<string, { d1: number; d2: number }>();
    public pendingBankruptMap = new Map<string, string>(); // creditorId → bankruptId
    public pendingTradeMortgages = new Map<string, any[]>();
    public debtAmountMap = new Map<string, { creditorId: string; amount: number }>();

    // Housing & hotel pool
    public bankHouses = 32;
    public bankHotels = 12;

    public chanceGetOutOwner: string | null = null;
    public chestGetOutOwner: string | null = null;

    // Property Auction state
    public currentAuction: {
        propertyPosition: number;
        currentBid: number;
        currentBidderId: string;
        timerSeconds: number;
        bids: Array<{ bidderName: string; amount: number }>;
    } | null = null;
    public auctionIntervalId: any = null;

    // Callbacks for socket events
    public emitAll: (event: string, args: any) => void = () => {};
    public emitExcepts: (id: string, event: string, args: any) => void = () => {};
    public emitStateUpdate: () => void = () => {};
    public emitServerHistory: (actionText: string) => void = () => {};
    public logFunction: (...data: any[]) => void = () => {};

    /**
     * Calculates the total net worth of a player including cash balance, mortgaged properties values, and houses/hotels value.
     *
     * @param player The Player instance
     * @returns The total calculated net worth
     */
    public calculateNetWorth(player: Player): number {
        let nw = player.balance;
        for (const prop of player.properties) {
            const propData = propertyByPosition.get(prop.position);
            if (!propData) continue;
            if (prop.morgage === true || (prop.morgage as any) === "true") {
                nw += Math.round((propData.price ?? 0) * 0.5);
            } else {
                nw += propData.price ?? 0;
                const housesCount = typeof prop.count === "number" ? prop.count : prop.count === "h" ? 5 : 0;
                const houseCost = propData.housecost ?? 0;
                nw += housesCount * houseCost;
            }
        }
        return nw;
    }

    /**
     * Initializes player statistics entry in gameStats and hooks balance changes to track total cash gains and losses.
     *
     * @param player The Player instance
     */
    public initPlayerStats(player: Player) {
        if (!this.gameStats.playerStats[player.id]) {
            this.gameStats.playerStats[player.id] = {
                totalGained: 0,
                totalLost: 0,
                rentPaid: 0,
                rentReceived: 0,
                taxesPaid: 0,
                netWorthHistory: [{ turn: 0, netWorth: this.calculateNetWorth(player) }],
                doublesRolled: 0,
                goodCardsDrawn: 0,
                badCardsDrawn: 0,
                jailCount: 0,
                luckyEvents: 0,
                unluckyEvents: 0,
                cumulativeLuck: 0,
                luckEventsCount: 0,
            };
        }
        player.onBalanceChange = (prev: number, val: number) => {
            const diff = val - prev;
            if (diff > 0) {
                this.gameStats.playerStats[player.id].totalGained += diff;
            } else if (diff < 0) {
                this.gameStats.playerStats[player.id].totalLost += Math.abs(diff);
            }
        };
    }

    /**
     * Checks if the win condition has been met according to selected game mode rules.
     *
     * @returns The winning Player if a winner is found, or null
     */
    public checkWinCondition(): Player | null {
        const active = Array.from(this.clients.values()).filter((v) => !v.player.isBankrupt);
        if (active.length === 1) return active[0].player;

        if (this.selectedMode.WinningMode === "last-standing") {
            return null;
        }

        for (const { player } of Array.from(this.clients.values())) {
            if (player.isBankrupt) continue;

            const prpGrups: string[] = [];
            for (const prp of player.properties) {
                if (!["Special", "Railroad", "Utilities"].includes(prp.group)) {
                    prpGrups.push(prp.group);
                }
            }

            const uniqueGroups = Array.from(new Set(prpGrups));
            let completedSets = 0;
            for (const g of uniqueGroups) {
                const ownedCount = prpGrups.filter((v) => v === g).length;
                const totalInGroup = monopolyJSON.properties.filter((v) => v.group === g).length;
                if (ownedCount === totalInGroup) {
                    completedSets += 1;
                }
            }

            if (completedSets >= 3) {
                return player;
            }

            if (this.selectedMode.WinningMode === "monopols & trains") {
                const railroadsOwned = player.properties.filter((v) => v.group === "Railroad").length;
                if (railroadsOwned >= 4) {
                    return player;
                }
            }
        }
        return null;
    }

    /**
     * Evaluates the win condition and resets ready states and turn IDs if a winner is found.
     *
     * @returns The winning Player if a winner is found, or null
     */
    public checkAndHandleWinCondition(): Player | null {
        const winner = this.checkWinCondition();
        if (winner) {
            this.gameStarted = false;
            for (const c of Array.from(this.clients.values())) {
                c.ready = false;
                this.emitAll("ready", { id: c.player.id, state: false, selectedMode: this.selectedMode });
            }
            this.currentId = winner.id;
        }
        return winner;
    }

    /**
     * Calculates expected rent risk/exposure and maximum possible rent exposure for the player's next move.
     *
     * @param player The Player instance
     * @param oldPos The player's current position on the board
     * @returns An object containing expectedRent and maxRent
     */
    public getExpectedRentExposure(player: Player, oldPos: number): { expectedRent: number; maxRent: number } {
        const probs: Record<number, number> = {
            2: 1 / 36,
            12: 1 / 36,
            3: 2 / 36,
            11: 2 / 36,
            4: 3 / 36,
            10: 3 / 36,
            5: 4 / 36,
            9: 4 / 36,
            6: 5 / 36,
            8: 5 / 36,
            7: 6 / 36,
        };

        let expectedRent = 0;
        let maxRent = 0;

        for (let roll = 2; roll <= 12; roll++) {
            const targetPos = (oldPos + roll) % 40;
            const prop = propertyByPosition.get(targetPos);
            if (!prop) continue;

            let rentOrTax = 0;

            if (prop.id === "incometax") {
                rentOrTax = 200;
            } else if (prop.id === "luxerytax") {
                rentOrTax = 100;
            } else if (prop.group && prop.group !== "Special") {
                const clientOwner = Array.from(this.clients.values()).find(
                    (c) => c.player.properties.some((p) => p.position === targetPos) && !c.player.isBankrupt,
                );
                if (clientOwner && clientOwner.player.id !== player.id) {
                    const owner = clientOwner.player;
                    const prp = owner.properties.find((p) => p.position === targetPos);
                    if (prp && prp.morgage !== true && (prp.morgage as any) !== "true") {
                        if (prop.group === "Utilities") {
                            const ownedCount = owner.properties.filter(
                                (op) => propertyByPosition.get(op.position)?.group === "Utilities",
                            ).length;
                            rentOrTax = 7 * (ownedCount === 2 ? 10 : 4);
                        } else if (prop.group === "Railroad") {
                            const ownedCount = owner.properties.filter(
                                (op) => propertyByPosition.get(op.position)?.group === "Railroad",
                            ).length;
                            rentOrTax = [0, 25, 50, 100, 200][Math.min(ownedCount, 4)];
                        } else {
                            const prpCount = prp.count;
                            const houseCount = typeof prpCount === "number" ? prpCount : prpCount === "h" ? 5 : 0;
                            if (houseCount === 0) {
                                const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prop.group);
                                const ownedGroup = owner.properties.filter((p: any) => p.group === prop.group);
                                const hasMonopoly = groupProps.length > 0 && ownedGroup.length === groupProps.length;
                                const allUnimproved = ownedGroup.every((p: any) => p.count === 0);
                                const noneMortgaged = ownedGroup.every(
                                    (p: any) => p.morgage !== true && (p.morgage as any) !== "true",
                                );
                                rentOrTax = (prop.rent ?? 0) * (hasMonopoly && allUnimproved && noneMortgaged ? 2 : 1);
                            } else {
                                rentOrTax = (prop.multpliedrent ?? [])[houseCount - 1] ?? prop.rent ?? 0;
                            }
                        }
                    }
                }
            }

            expectedRent += probs[roll] * rentOrTax;
            if (rentOrTax > maxRent) {
                maxRent = rentOrTax;
            }
        }

        return { expectedRent, maxRent };
    }

    /**
     * Processes game events and financial rules when a player lands on a specific board tile.
     *
     * @param player The landing Player instance
     * @param position The landed tile position index (0-39)
     * @param rolls Total value of the dice rolls that led to this landing (used for railroad/utility rent calculations)
     * @param multiplier Rent multiplier (used for card effects)
     * @param isCardMove Whether the landing was caused by a card movement (affects luck statistics calculation)
     * @returns Decision structure indicating if the player needs to buy the property, and the log annotation
     */
    public processLanding(
        player: Player,
        position: number,
        rolls: number,
        multiplier = 1,
        isCardMove = false,
    ): { requiresPurchaseDecision: boolean; landingNote: string } {
        const prop = propertyByPosition.get(position);
        if (!prop) return { requiresPurchaseDecision: false, landingNote: "" };
        if (INERT_TILES.has(prop.id ?? "")) return { requiresPurchaseDecision: false, landingNote: "" };
        if (CARD_TILES.has(prop.id ?? "")) return { requiresPurchaseDecision: false, landingNote: "" };
        if (prop.id === "gotojail") return { requiresPurchaseDecision: false, landingNote: "" };

        const getRentLuckWeight = (pOwner: Player, pos: number) => {
            const prp = pOwner.properties.find((p) => p.position === pos);
            if (!prp) return 1;
            if (prp.count === "h") return 3;
            if (typeof prp.count === "number" && prp.count > 0) return 2;
            return 1;
        };

        let expectedRent = 0;
        let maxRent = 0;
        if (!isCardMove) {
            const oldPos = (((position - rolls) % 40) + 40) % 40;
            const exposure = this.getExpectedRentExposure(player, oldPos);
            expectedRent = exposure.expectedRent;
            maxRent = exposure.maxRent;
        }

        let actualPaid = 0;
        let result: { requiresPurchaseDecision: boolean; landingNote: string } = {
            requiresPurchaseDecision: false,
            landingNote: "",
        };

        if (prop.id === "incometax") {
            player.balance -= 200;
            actualPaid = 200;
            const pStatsTax = this.gameStats.playerStats[player.id];
            if (pStatsTax) {
                pStatsTax.taxesPaid += 200;
                pStatsTax.unluckyEvents += 1;
            }
            result = { requiresPurchaseDecision: false, landingNote: "incometax:200" };
        } else if (prop.id === "luxerytax") {
            player.balance -= 100;
            actualPaid = 100;
            const pStatsLux = this.gameStats.playerStats[player.id];
            if (pStatsLux) {
                pStatsLux.taxesPaid += 100;
                pStatsLux.unluckyEvents += 1;
            }
            result = { requiresPurchaseDecision: false, landingNote: "luxerytax:100" };
        } else {
            const playersList = Array.from(this.clients.values()).map((c) => c.player);
            const { owner, amount } = computeRent(position, rolls, playersList, multiplier);
            if (owner !== null) {
                if (owner.id === player.id) {
                    result = { requiresPurchaseDecision: true, landingNote: `own:${position}` };
                } else if (amount > 0) {
                    player.balance -= amount;
                    actualPaid = amount;
                    const rentWeight = getRentLuckWeight(owner, position);
                    const pStatsRent = this.gameStats.playerStats[player.id];
                    if (pStatsRent) {
                        pStatsRent.rentPaid += amount;
                        pStatsRent.unluckyEvents += rentWeight;
                    }
                    const oStatsRent = this.gameStats.playerStats[owner.id];
                    if (oStatsRent) {
                        oStatsRent.rentReceived += amount;
                        oStatsRent.luckyEvents += rentWeight;
                        oStatsRent.cumulativeLuck += rentWeight * 0.25;
                        oStatsRent.luckEventsCount += 1;
                    }
                    if (player.balance >= 0) {
                        owner.balance += amount;
                    } else {
                        this.debtAmountMap.set(player.id, { creditorId: owner.id, amount });
                    }
                    result = { requiresPurchaseDecision: false, landingNote: `rent:${owner.id}:${amount}` };
                } else {
                    result = { requiresPurchaseDecision: false, landingNote: "" };
                }
            } else if (prop.price !== undefined && prop.group !== "Special") {
                const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prop.group);
                const ownedGroup = player.properties.filter((op: any) => op.group === prop.group);
                const isCompletingMonopoly = groupProps.length > 0 && ownedGroup.length === groupProps.length - 1;

                let opportunityLuck = 0.2;
                if (isCompletingMonopoly) {
                    if (prop.group === "Railroad" || prop.group === "Utilities") {
                        opportunityLuck = 0.4;
                    } else {
                        opportunityLuck = 0.5;
                    }
                }

                const pStats = this.gameStats.playerStats[player.id];
                if (pStats) {
                    pStats.luckyEvents += isCompletingMonopoly ? 2 : 1;
                    pStats.cumulativeLuck += opportunityLuck;
                    pStats.luckEventsCount += 1;
                }

                result = { requiresPurchaseDecision: true, landingNote: `unowned:${position}` };
            } else {
                result = { requiresPurchaseDecision: false, landingNote: "" };
            }
        }

        if (!isCardMove && maxRent > 0) {
            const deviation = (expectedRent - actualPaid) / maxRent;
            const pStats = this.gameStats.playerStats[player.id];
            if (pStats) {
                pStats.cumulativeLuck += deviation;
                pStats.luckEventsCount += 1;
            }
        }

        return result;
    }

    /**
     * Resolves the actions and modifications of a drawn Chance or Community Chest card.
     *
     * @param player The active Player instance
     * @param card The raw card configuration object
     * @param rolls Dice rolls value
     * @returns Execution flags and status of card actions
     */
    public resolveCard(
        player: Player,
        card: any,
        rolls: number,
    ): {
        requiresPurchaseDecision: boolean;
        newPosition?: number;
        extraRoll?: [number, number];
        landingNote?: string;
        pendingCard?: any;
    } {
        switch (card.action) {
            case "addfunds":
                player.balance += card.amount ?? 0;
                return { requiresPurchaseDecision: false };

            case "removefunds":
                player.balance -= card.amount ?? 0;
                const pStatsRemove = this.gameStats.playerStats[player.id];
                if (pStatsRemove) pStatsRemove.taxesPaid += card.amount ?? 0;
                return { requiresPurchaseDecision: false };

            case "addfundsfromplayers": {
                for (const { player: p } of Array.from(this.clients.values()).filter(
                    (c) => c.player.id !== player.id && !c.player.isBankrupt,
                )) {
                    p.balance -= card.amount ?? 0;
                    player.balance += card.amount ?? 0;
                    const otherStats = this.gameStats.playerStats[p.id];
                    if (otherStats) {
                        otherStats.unluckyEvents += 1;
                        otherStats.cumulativeLuck -= 0.5;
                        otherStats.luckEventsCount += 1;
                    }
                }
                return { requiresPurchaseDecision: false };
            }

            case "removefundstoplayers": {
                for (const { player: p } of Array.from(this.clients.values()).filter(
                    (c) => c.player.id !== player.id && !c.player.isBankrupt,
                )) {
                    p.balance += card.amount ?? 0;
                    player.balance -= card.amount ?? 0;
                    const otherStats = this.gameStats.playerStats[p.id];
                    if (otherStats) {
                        otherStats.luckyEvents += 1;
                        otherStats.cumulativeLuck += 0.5;
                        otherStats.luckEventsCount += 1;
                    }
                }
                return { requiresPurchaseDecision: false };
            }

            case "jail":
                if (card.subaction === "goto") {
                    player.position = 10;
                    player.isInJail = true;
                    player.jailTurnsRemaining = 3;
                    this.gameStats.tileVisits[10] = (this.gameStats.tileVisits[10] || 0) + 1;
                    const pStats = this.gameStats.playerStats[player.id];
                    if (pStats) pStats.jailCount += 1;
                    return { requiresPurchaseDecision: false, newPosition: 10 };
                }
                if (card.subaction === "getout") {
                    player.getoutCards += 1;
                    if (card.title.includes("traded")) {
                        this.chanceGetOutOwner = player.id;
                    } else {
                        this.chestGetOutOwner = player.id;
                    }
                }
                return { requiresPurchaseDecision: false };

            case "move": {
                let targetPos: number | undefined;
                let passedGo = false;
                if (card.tileid) {
                    targetPos = propertyById.get(card.tileid)?.position;
                    if (targetPos !== undefined && targetPos < player.position) passedGo = true;
                } else if (card.count !== undefined) {
                    const raw = player.position + card.count;
                    targetPos = ((raw % 40) + 40) % 40;
                    if (card.count > 0 && raw >= 40) passedGo = true;
                }
                if (targetPos === undefined) return { requiresPurchaseDecision: false };
                if (passedGo) player.balance += 200;
                player.position = targetPos;
                this.gameStats.tileVisits[targetPos] = (this.gameStats.tileVisits[targetPos] || 0) + 1;

                const prop = propertyByPosition.get(targetPos);
                if (prop && CARD_TILES.has(prop.id ?? "")) {
                    const deck = prop.id === "chance" ? monopolyJSON.chance : (monopolyJSON as any).communitychest;
                    let nextCard = deck[Math.floor(Math.random() * deck.length)];
                    if (nextCard.action === "jail" && nextCard.subaction === "getout") {
                        const isChance = prop.id === "chance";
                        const alreadyHeld = isChance ? this.chanceGetOutOwner !== null : this.chestGetOutOwner !== null;
                        if (alreadyHeld) {
                            const filtered = deck.filter(
                                (c: any) => !(c.action === "jail" && c.subaction === "getout"),
                            );
                            nextCard = filtered[Math.floor(Math.random() * filtered.length)];
                        }
                    }
                    this.emitServerHistory(
                        `${player.username} landed on ${prop.id === "chance" ? "Chance" : "Community Chest"} space and drew card: "${nextCard.title}"`,
                    );
                    const result = this.resolveCard(player, nextCard, rolls);
                    return {
                        requiresPurchaseDecision: result.requiresPurchaseDecision,
                        newPosition: result.newPosition ?? targetPos,
                        landingNote: result.landingNote,
                        pendingCard: {
                            element: nextCard,
                            is_chance: prop.id === "chance",
                            requiresPurchaseDecision: result.requiresPurchaseDecision,
                            newPosition: result.newPosition ?? targetPos,
                            extraRoll: result.extraRoll ?? null,
                        },
                    };
                }

                const landing = this.processLanding(player, targetPos, rolls, 1, true);
                return {
                    requiresPurchaseDecision: landing.requiresPurchaseDecision,
                    newPosition: targetPos,
                    landingNote: landing.landingNote,
                };
            }

            case "movenearest": {
                const group = card.groupid === "utility" ? "Utilities" : "Railroad";
                const positions = monopolyJSON.properties
                    .filter((p) => p.group === group)
                    .map((p) => p.position ?? 0)
                    .sort((a, b) => a - b);

                let nearest = positions[0];
                for (const pos of positions) {
                    if (pos > player.position) {
                        nearest = pos;
                        break;
                    }
                }
                if (nearest <= player.position) player.balance += 200;

                player.position = nearest;
                this.gameStats.tileVisits[nearest] = (this.gameStats.tileVisits[nearest] || 0) + 1;

                if (group === "Utilities") {
                    const d1 = Math.floor(Math.random() * 6) + 1;
                    const d2 = Math.floor(Math.random() * 6) + 1;
                    const landing = this.processLanding(player, nearest, d1 + d2, card.rentmultiplier ?? 1, true);
                    return {
                        requiresPurchaseDecision: landing.requiresPurchaseDecision,
                        newPosition: nearest,
                        extraRoll: [d1, d2],
                        landingNote: landing.landingNote,
                    };
                }
                const landing = this.processLanding(player, nearest, rolls, card.rentmultiplier ?? 1, true);
                return {
                    requiresPurchaseDecision: landing.requiresPurchaseDecision,
                    newPosition: nearest,
                    landingNote: landing.landingNote,
                };
            }

            case "propertycharges": {
                const houses = player.properties
                    .filter((p: any) => typeof p.count === "number" && p.count > 0)
                    .reduce((s: number, p: any) => s + (p.count as number), 0);
                const hotels = player.properties.filter((p: any) => p.count === "h").length;
                const amt = (card.buildings ?? 0) * houses + (card.hotels ?? 0) * hotels;
                player.balance -= amt;
                const pStatsCharges = this.gameStats.playerStats[player.id];
                if (pStatsCharges) pStatsCharges.taxesPaid += amt;
                return { requiresPurchaseDecision: false };
            }

            default:
                return { requiresPurchaseDecision: false };
        }
    }

    /**
     * Starts a real-time property auction bidding cycle for a specified board tile.
     *
     * @param position The position of the property being auctioned
     */
    public startAuction(position: number) {
        const prop = propertyByPosition.get(position) as any;
        if (!prop) return;

        if (this.auctionIntervalId) clearInterval(this.auctionIntervalId);

        this.currentAuction = {
            propertyPosition: position,
            currentBid: 0,
            currentBidderId: "",
            timerSeconds: 20,
            bids: [],
        };

        this.emitAll("auction-start", {
            position,
            name: prop.name,
            price: prop.price,
            startingBid: 1,
            timerSeconds: 20,
            bids: [],
        });
        this.emitServerHistory(`Auction started for ${prop.name} (list price: $${prop.price})`);

        this.auctionIntervalId = setInterval(() => {
            if (!this.currentAuction) {
                if (this.auctionIntervalId) clearInterval(this.auctionIntervalId);
                return;
            }
            this.currentAuction.timerSeconds -= 1;
            this.emitAll("auction-tick", { timerSeconds: this.currentAuction.timerSeconds });
            if (this.currentAuction.timerSeconds <= 0) {
                if (this.auctionIntervalId) clearInterval(this.auctionIntervalId);
                this.endAuction();
            }
        }, 1000);
    }

    /**
     * Concludes the current property auction, determines the winner, transfers ownership, and collects payment.
     */
    public endAuction() {
        if (!this.currentAuction) return;
        const auction = this.currentAuction;
        this.currentAuction = null;
        if (this.auctionIntervalId) clearInterval(this.auctionIntervalId);

        if (auction.currentBidderId === "" || auction.currentBid === 0) {
            this.emitAll("auction-skip", { position: auction.propertyPosition });
            this.emitServerHistory(`Auction ended with no bids — property returned to Bank`);
            this.emitStateUpdate();
            return;
        }

        const winnerClient = this.clients.get(auction.currentBidderId);
        const prop = propertyByPosition.get(auction.propertyPosition) as any;
        if (!winnerClient || !prop) return;

        const winner = winnerClient.player;
        winner.balance -= auction.currentBid;
        winner.properties.push({
            position: auction.propertyPosition,
            count: 0,
            group: prop.group ?? "",
        });

        if (prop.group && prop.group !== "Special") {
            const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prop.group);
            const ownedGroup = winner.properties.filter((p: any) => p.group === prop.group);
            if (groupProps.length > 0 && ownedGroup.length === groupProps.length) {
                this.emitServerHistory(`${winner.username} completed the ${prop.group} color group monopoly!`);
            }
        }

        this.emitAll("auction-end", {
            winnerId: winner.id,
            winnerName: winner.username,
            bid: auction.currentBid,
            position: auction.propertyPosition,
        });
        this.emitServerHistory(`${winner.username} won the auction for ${prop.name} at $${auction.currentBid}`);
        this.checkAndHandleWinCondition();
        this.emitStateUpdate();
    }

    /**
     * Declares a player bankrupt, transferring cash, card assets, and liquidated properties to their creditor.
     *
     * @param targetId The ID of the bankrupt player
     */
    public declareBankruptcyForPlayer(targetId: string) {
        const clientItem = this.clients.get(targetId);
        if (!clientItem) return;
        const bpPlayer = clientItem.player;
        this.logFunction(
            `[BANKRUPTCY] Player ${bpPlayer.username} is declaring bankruptcy. Balance: ${bpPlayer.balance}`,
        );
        if (bpPlayer.isBankrupt) {
            this.logFunction(`[BANKRUPTCY] Player is already bankrupt.`);
            return;
        }
        if (bpPlayer.balance >= 0) {
            this.logFunction(`[BANKRUPTCY] Player balance is not negative: ${bpPlayer.balance}. Rejecting.`);
            return;
        }

        bpPlayer.isBankrupt = true;
        const creditor = this.creditorMap.get(bpPlayer.id) ?? "bank";
        this.logFunction(`[BANKRUPTCY] Creditor for ${bpPlayer.username}: ${creditor}`);

        if (creditor !== "bank") {
            const creditorClient = this.clients.get(creditor as string);
            if (creditorClient) {
                const cp = creditorClient.player;
                this.logFunction(`[BANKRUPTCY] Found creditor player: ${cp.username}`);
                this.emitServerHistory(`${bpPlayer.username} declared bankruptcy to ${cp.username}`);

                // Transfer remaining cash to creditor (excluding the unpaid rent debt)
                const debt = this.debtAmountMap.get(bpPlayer.id);
                const rentAmt = debt ? debt.amount : 0;
                const actualCash = bpPlayer.balance + rentAmt;
                if (actualCash > 0) {
                    cp.balance += actualCash;
                    this.emitServerHistory(`${cp.username} received $${actualCash} cash from ${bpPlayer.username}`);
                }

                // Transfer/Release jail cards
                if (bpPlayer.getoutCards > 0) {
                    cp.getoutCards += bpPlayer.getoutCards;
                    if (this.chanceGetOutOwner === bpPlayer.id) {
                        this.chanceGetOutOwner = cp.id;
                    }
                    if (this.chestGetOutOwner === bpPlayer.id) {
                        this.chestGetOutOwner = cp.id;
                    }
                    this.emitServerHistory(
                        `${cp.username} received ${bpPlayer.getoutCards} Get Out of Jail Free card(s) from ${bpPlayer.username}`,
                    );
                    bpPlayer.getoutCards = 0;
                }

                for (const prp of bpPlayer.properties) {
                    const propData = propertyById.get(prp.position?.toString()) ?? propertyByPosition.get(prp.position);
                    const propName = propData?.name ?? "a property";

                    // Liquidate buildings → 50% refund to creditor and return to bank pool
                    if (prp.count === "h") {
                        const refund = Math.round(((propData as any)?.ohousecost ?? 0) * 0.5);
                        cp.balance += refund;
                        this.bankHotels += 1;
                        this.emitServerHistory(`${cp.username} received $${refund} from hotel sold on ${propName}`);
                    } else if (typeof prp.count === "number" && prp.count > 0) {
                        const refund = Math.round(((propData as any)?.housecost ?? 0) * 0.5) * prp.count;
                        cp.balance += refund;
                        this.bankHouses += prp.count;
                        this.emitServerHistory(
                            `${cp.username} received $${refund} from ${prp.count} house(s) sold on ${propName}`,
                        );
                    }
                    prp.count = 0;

                    // Transfer property to creditor
                    cp.properties.push(prp);
                    this.emitServerHistory(`${cp.username} received ${propName} from ${bpPlayer.username}`);
                }

                // If there are mortgaged properties, pause and ask creditor
                const mortgagedPending = cp.properties
                    .filter((prp: any) => prp.morgage === true || prp.morgage === "true")
                    .filter((prp: any) => {
                        return bpPlayer.properties.some((orig: any) => orig.position === prp.position);
                    })
                    .map((prp: any) => {
                        const propData = propertyByPosition.get(prp.position) as any;
                        const price = propData?.price ?? 0;
                        return {
                            position: prp.position,
                            name: propData?.name ?? "Unknown",
                            mortgageValue: Math.round(price * 0.5),
                            interestFee: Math.round(price * 0.05),
                            unmortgageCost: Math.round(price * 0.55),
                        };
                    });

                if (mortgagedPending.length > 0) {
                    this.pendingBankruptMap.set(creditor as string, targetId);
                    creditorClient.socket.emit("mortgage-transfer-pending", {
                        properties: mortgagedPending,
                        bankruptName: bpPlayer.username,
                    });
                    this.emitStateUpdate();
                    return;
                }

                this.finalizeBankruptcy(targetId);
            } else {
                this.logFunction(`[BANKRUPTCY] Creditor client not found for id: ${creditor}`);
            }
        } else {
            this.emitServerHistory(`${bpPlayer.username} declared bankruptcy to the Bank`);
            if (bpPlayer.getoutCards > 0) {
                if (this.chanceGetOutOwner === bpPlayer.id) {
                    this.chanceGetOutOwner = null;
                }
                if (this.chestGetOutOwner === bpPlayer.id) {
                    this.chestGetOutOwner = null;
                }
                bpPlayer.getoutCards = 0;
            }
            for (const prp of bpPlayer.properties) {
                const propData = propertyById.get(prp.position?.toString()) ?? propertyByPosition.get(prp.position);
                const propName = propData?.name ?? "a property";

                if (prp.count === "h") {
                    this.bankHotels += 1;
                } else if (typeof prp.count === "number" && prp.count > 0) {
                    this.bankHouses += prp.count;
                }
                prp.count = 0;
                prp.morgage = false;
                this.emitServerHistory(`${propName} was returned to the Bank`);
            }
            this.finalizeBankruptcy(targetId);
        }
    }

    /**
     * Finalizes bankruptcy status, clears active tracking lists, and advances the game turn to the next player.
     *
     * @param bankruptSocketId The ID of the bankrupt player
     */
    public finalizeBankruptcy(bankruptSocketId: string) {
        const bankruptClient = this.clients.get(bankruptSocketId);
        if (!bankruptClient) return;
        const bp = bankruptClient.player;
        bp.properties = [];
        bp.balance = 0;
        this.consecutiveDoublesMap.set(bankruptSocketId, 0);
        this.creditorMap.set(bp.id, null);
        this.debtAmountMap.delete(bankruptSocketId);
        bp.hasRolled = false;
        bp.allowRollAgain = false;

        const active = Array.from(this.clients.values()).filter((v) => !v.player.isBankrupt);
        const arr = active.map((v) => v.player.id);
        let i = arr.indexOf(bankruptSocketId);
        i = arr.length > 0 ? (i + 1) % arr.length : -1;
        this.currentId = i === -1 ? "" : arr[i];

        this.emitAll("player-bankrupt", {
            bankruptId: bp.id,
            creditorId: this.creditorMap.get(bp.id) ?? "bank",
            turnId: this.currentId,
            pJsons: Array.from(this.clients.values()).map((c) => c.player.to_json()),
        });

        this.checkAndHandleWinCondition();
        this.emitStateUpdate();
    }

    /**
     * Validates deal guidelines and processes property and money transfers for an accepted trade.
     *
     * @param x The GameTrading transaction proposal details
     * @returns True if the trade succeeded, otherwise false
     */
    public validateAndExecuteTrade(x: GameTrading): boolean {
        if (!this.selectedMode.AllowDeals) return false;
        if (!x.turnPlayer.accepted || !x.againstPlayer.accepted) return false;

        const tpClient = this.clients.get(x.turnPlayer.id);
        const apClient = this.clients.get(x.againstPlayer.id);
        if (!tpClient || !apClient) return false;

        const tp = tpClient.player;
        const ap = apClient.player;

        if (tp.isBankrupt || ap.isBankrupt) return false;

        if (x.turnPlayer.balance < 0 || x.againstPlayer.balance < 0) return false;
        if (x.turnPlayer.balance > 0 && tp.balance < x.turnPlayer.balance) return false;
        if (x.againstPlayer.balance > 0 && ap.balance < x.againstPlayer.balance) return false;

        const hasGroupBuildings = (player: Player, group: string) => {
            if (!group || group === "Railroad" || group === "Utilities" || group === "Special") return false;
            return player.properties
                .filter((p: any) => p.group === group)
                .some((p: any) => p.count !== 0 && p.count !== undefined);
        };

        for (const offer of x.turnPlayer.prop) {
            const owned = tp.properties.find((p: any) => p.position === offer.position);
            if (!owned) return false;
            if (hasGroupBuildings(tp, offer.group)) return false;
        }

        for (const offer of x.againstPlayer.prop) {
            const owned = ap.properties.find((p: any) => p.position === offer.position);
            if (!owned) return false;
            if (hasGroupBuildings(ap, offer.group)) return false;
        }

        const tGets = ap.properties.filter((v1: any) => x.againstPlayer.prop.some((v2) => v2.position === v1.position));
        ap.properties = ap.properties.filter(
            (v1: any) => !x.againstPlayer.prop.some((v2) => v2.position === v1.position),
        );

        const aGets = tp.properties.filter((v1: any) => x.turnPlayer.prop.some((v2) => v2.position === v1.position));
        tp.properties = tp.properties.filter((v1: any) => !x.turnPlayer.prop.some((v2) => v2.position === v1.position));

        ap.balance -= x.againstPlayer.balance;
        tp.balance -= x.turnPlayer.balance;
        tp.balance += x.againstPlayer.balance;
        ap.balance += x.turnPlayer.balance;

        tp.properties.push(...tGets);
        ap.properties.push(...aGets);

        for (const prp of tGets) {
            if (prp.group && prp.group !== "Special") {
                const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prp.group);
                const ownedGroup = tp.properties.filter((p: any) => p.group === prp.group);
                if (groupProps.length > 0 && ownedGroup.length === groupProps.length) {
                    this.emitServerHistory(`${tp.username} completed the ${prp.group} color group monopoly via trade!`);
                }
            }
        }
        for (const prp of aGets) {
            if (prp.group && prp.group !== "Special") {
                const groupProps = monopolyJSON.properties.filter((p: any) => p.group === prp.group);
                const ownedGroup = ap.properties.filter((p: any) => p.group === prp.group);
                if (groupProps.length > 0 && ownedGroup.length === groupProps.length) {
                    this.emitServerHistory(`${ap.username} completed the ${prp.group} color group monopoly via trade!`);
                }
            }
        }

        const tpMortgaged = tGets.filter((prp: any) => prp.morgage === true || prp.morgage === "true");
        const apMortgaged = aGets.filter((prp: any) => prp.morgage === true || prp.morgage === "true");

        if (tpMortgaged.length > 0) {
            const pendingList = tpMortgaged.map((prp: any) => {
                const propData = propertyByPosition.get(prp.position) as any;
                const price = propData?.price ?? 0;
                return {
                    position: prp.position,
                    name: propData?.name ?? "Unknown",
                    mortgageValue: Math.round(price * 0.5),
                    interestFee: Math.round(price * 0.05),
                    unmortgageCost: Math.round(price * 0.55),
                };
            });
            this.pendingTradeMortgages.set(tp.id, pendingList);
            tpClient.socket.emit("mortgage-transfer-pending", {
                properties: pendingList,
                bankruptName: ap.username,
            });
        }

        if (apMortgaged.length > 0) {
            const pendingList = apMortgaged.map((prp: any) => {
                const propData = propertyByPosition.get(prp.position) as any;
                const price = propData?.price ?? 0;
                return {
                    position: prp.position,
                    name: propData?.name ?? "Unknown",
                    mortgageValue: Math.round(price * 0.5),
                    interestFee: Math.round(price * 0.05),
                    unmortgageCost: Math.round(price * 0.55),
                };
            });
            this.pendingTradeMortgages.set(ap.id, pendingList);
            apClient.socket.emit("mortgage-transfer-pending", {
                properties: pendingList,
                bankruptName: tp.username,
            });
        }

        this.emitServerHistory(`${tp.username} done a trade with ${ap.username}`);
        this.emitAll("submit-trade", {
            pJsons: [tp.to_json(), ap.to_json()],
            action: `${tp.username} done a trade with ${ap.username}`,
        });
        this.checkAndHandleWinCondition();
        this.emitStateUpdate();
        return true;
    }
}
