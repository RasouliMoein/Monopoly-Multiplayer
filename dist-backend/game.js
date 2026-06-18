"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const sockets_1 = require("./sockets");
const monopoly_json_1 = __importDefault(require("./monopoly.json"));
const types_1 = require("./types");
// ── Static lookup maps ────────────────────────────────────────────────────────
const propertyByPosition = new Map(monopoly_json_1.default.properties.map((p) => [p.posistion ?? 0, p]));
const propertyById = new Map(monopoly_json_1.default.properties.map((p) => [p.id ?? "", p]));
const CARD_TILES = new Set(["communitychest", "chance"]);
const INERT_TILES = new Set(["go", "jail", "freeparking"]);
// ── Player ────────────────────────────────────────────────────────────────────
class Player {
    id;
    username;
    icon;
    position;
    balance;
    properties;
    isInJail;
    jailTurnsRemaining;
    getoutCards;
    connected;
    isBankrupt; // Phase 2A
    hasRolled;
    allowRollAgain;
    constructor(_id, _name, _icon, cash) {
        this.id = _id;
        this.username = _name;
        this.icon = _icon;
        this.position = 0;
        this.balance = cash ?? 1500;
        this.properties = [];
        this.isInJail = false;
        this.jailTurnsRemaining = 0;
        this.getoutCards = 0;
        this.connected = true;
        this.isBankrupt = false; // Phase 2A
        this.hasRolled = false;
        this.allowRollAgain = false;
    }
    to_json() {
        return {
            id: this.id,
            username: this.username,
            icon: this.icon,
            position: this.position,
            balance: this.balance,
            properties: this.properties,
            isInJail: this.isInJail,
            jailTurnsRemaining: this.jailTurnsRemaining,
            getoutCards: this.getoutCards,
            connected: this.connected,
            isBankrupt: this.isBankrupt,
            hasRolled: this.hasRolled,
            allowRollAgain: this.allowRollAgain,
        };
    }
    from_json(json) {
        if (this.id !== json.id)
            return;
        this.position = json.position;
        this.balance = json.balance;
        this.properties = json.properties;
        this.isInJail = json.isInJail;
        this.jailTurnsRemaining = json.jailTurnsRemaining;
        this.getoutCards = json.getoutCards;
        this.connected = json.connected ?? true;
        this.isBankrupt = json.isBankrupt ?? false; // Phase 2A
        this.hasRolled = json.hasRolled ?? false;
        this.allowRollAgain = json.allowRollAgain ?? false;
    }
}
// ── Main ──────────────────────────────────────────────────────────────────────
async function main(playersCount, f) {
    const maxPlayers = playersCount > 0 ? Math.min(playersCount, 6) : 6;
    const Clients = new Map();
    const logs_strings = [];
    let currentId = "";
    let gameStarted = false;
    let selectedMode = types_1.MonopolyModes[0];
    let hostId = "";
    // Phase 2A — tracking maps
    const consecutiveDoublesMap = new Map(); // playerId → doubles streak
    const creditorMap = new Map(); // playerId → who they owe
    const debugDiceOverrideMap = new Map();
    // Fix 5b: maps creditor socketId → bankrupt socketId while awaiting mortgage choices
    const pendingBankruptMap = new Map(); // creditorId → bankruptId
    // Rent debt: maps debtor playerId → { creditorId, amount } for deferred rent payment
    const debtAmountMap = new Map();
    // Phase 2 — Housing & hotel pool
    let bankHouses = 32;
    let bankHotels = 12;
    let chanceGetOutOwner = null;
    let chestGetOutOwner = null;
    let currentAuction = null;
    let auctionIntervalId = null;
    function getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
    function getPlayerColor(icon) {
        switch (icon) {
            case 0:
                return "#E0115F";
            case 1:
                return "#4169e1";
            case 2:
                return "#50C878";
            case 3:
                return "#FFC000";
            case 4:
                return "#a855f7";
            case 5:
                return "#FF7F50";
            default:
                return "#64748b";
        }
    }
    function emitServerHistory(actionText) {
        const historyObj = {
            action: actionText.replace(/\s+/g, " ").replace(/\bpayed\b/gi, "paid").trim(),
            time: new Date().toJSON(),
            balances: Array.from(Clients.values()).map((c) => ({
                username: c.player.username,
                balance: c.player.balance,
                color: getPlayerColor(c.player.icon),
            })),
        };
        EmitAll("history", historyObj);
    }
    function EmitAll(event, args) {
        for (const x of Array.from(Clients.values()))
            x.socket.emit(event, args);
    }
    function EmitExcepts(id, event, args) {
        for (const [k, x] of Array.from(Clients.entries()))
            if (k !== id)
                x.socket.emit(event, args);
    }
    /** Broadcast canonical player state to every connected client. */
    function EmitStateUpdate() {
        EmitAll("state_update", {
            players: Array.from(Clients.values()).map((c) => c.player.to_json()),
            hostId: hostId,
            bankHouses,
            bankHotels
        });
    }
    /**
     * Compute rent owed at a position (server-authoritative).
     * Returns { owner, amount }; amount=0 when mortgaged or unowned.
     */
    function computeRent(position, rolls, multiplier = 1) {
        const prop = propertyByPosition.get(position);
        if (!prop)
            return { owner: null, amount: 0 };
        for (const { player } of Array.from(Clients.values())) {
            for (const prp of player.properties) {
                if (prp.posistion !== position)
                    continue;
                if (prp.morgage === true)
                    return { owner: player, amount: 0 };
                let amt = 0;
                if (prop.group === "Utilities") {
                    const cnt = player.properties.filter((p) => p.group === "Utilities").length;
                    // Fix #3: when multiplier === 10 ("advance to nearest utility" Chance card),
                    // rent must be exactly 10 × dice. Normal landing uses 4× (1 utility) or 10× (2 utilities).
                    const baseRate = multiplier === 10 ? 1 : (cnt === 2 ? 10 : 4);
                    amt = rolls * baseRate * multiplier;
                }
                else if (prop.group === "Railroad") {
                    // Fix #2: count ALL owned railroads, not just unmortgaged ones.
                    // The mortgaged-railroad early-return above already handles the case
                    // where the landed railroad itself is mortgaged (returns amount=0).
                    const cnt = player.properties.filter((p) => p.group === "Railroad").length;
                    amt = ([0, 25, 50, 100, 200][cnt] ?? 0) * multiplier;
                }
                else if (prp.count === 0) {
                    // Fix #4: double rent when owner holds the full unimproved color group (monopoly).
                    const groupProps = monopoly_json_1.default.properties.filter((p) => p.group === prop.group);
                    const ownedGroup = player.properties.filter((p) => p.group === prop.group);
                    const hasMonopoly = groupProps.length > 0 && ownedGroup.length === groupProps.length;
                    // Only apply double when ALL properties in the set are unimproved.
                    // If any have been built on, that property uses its own rent tier instead.
                    const allUnimproved = ownedGroup.every((p) => p.count === 0);
                    amt = (prop.rent ?? 0) * (hasMonopoly && allUnimproved ? 2 : 1) * multiplier;
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
    /**
     * Process landing on a tile — mutates balances in place.
     * Returns: requiresPurchaseDecision (client should show buy/upgrade UI)
     *          landingNote (encoded event string for client notifications)
     */
    function processLanding(player, position, rolls, multiplier = 1) {
        const prop = propertyByPosition.get(position);
        if (!prop)
            return { requiresPurchaseDecision: false, landingNote: "" };
        if (INERT_TILES.has(prop.id ?? ""))
            return { requiresPurchaseDecision: false, landingNote: "" };
        if (CARD_TILES.has(prop.id ?? ""))
            return { requiresPurchaseDecision: false, landingNote: "" };
        if (prop.id === "gotojail")
            return { requiresPurchaseDecision: false, landingNote: "" }; // handled in roll_dice
        if (prop.id === "incometax") {
            player.balance -= 200;
            return { requiresPurchaseDecision: false, landingNote: "incometax:200" };
        }
        if (prop.id === "luxerytax") {
            player.balance -= 100;
            return { requiresPurchaseDecision: false, landingNote: "luxerytax:100" };
        }
        const { owner, amount } = computeRent(position, rolls, multiplier);
        if (owner !== null) {
            if (owner.id === player.id)
                return { requiresPurchaseDecision: true, landingNote: `own:${position}` };
            if (amount > 0) {
                player.balance -= amount;
                if (player.balance >= 0) {
                    // Player can fully afford rent — normal transfer
                    owner.balance += amount;
                    return { requiresPurchaseDecision: false, landingNote: `rent:${owner.id}:${amount}` };
                }
                else {
                    // Player cannot afford rent — store the owed amount to settle on finish-turn or handle in bankruptcy.
                    debtAmountMap.set(player.id, { creditorId: owner.id, amount });
                    return { requiresPurchaseDecision: false, landingNote: `rent:${owner.id}:${amount}` };
                }
            }
            return { requiresPurchaseDecision: false, landingNote: "" };
        }
        if (prop.price !== undefined && prop.group !== "Special") {
            return { requiresPurchaseDecision: true, landingNote: `unowned:${position}` };
        }
        return { requiresPurchaseDecision: false, landingNote: "" };
    }
    /**
     * Resolve a Chance / Community Chest card — mutates state in place.
     */
    function resolveCard(player, card, rolls) {
        switch (card.action) {
            case "addfunds":
                player.balance += card.amount ?? 0;
                return { requiresPurchaseDecision: false };
            case "removefunds":
                player.balance -= card.amount ?? 0;
                return { requiresPurchaseDecision: false };
            case "addfundsfromplayers": {
                // Fix 6: Exclude bankrupt players from card payments
                for (const { player: p } of Array.from(Clients.values()).filter((c) => c.player.id !== player.id && !c.player.isBankrupt)) {
                    p.balance -= card.amount ?? 0;
                    player.balance += card.amount ?? 0;
                }
                return { requiresPurchaseDecision: false };
            }
            case "removefundstoplayers": {
                // Fix 6: Exclude bankrupt players from card payments
                for (const { player: p } of Array.from(Clients.values()).filter((c) => c.player.id !== player.id && !c.player.isBankrupt)) {
                    p.balance += card.amount ?? 0;
                    player.balance -= card.amount ?? 0;
                }
                return { requiresPurchaseDecision: false };
            }
            case "jail":
                if (card.subaction === "goto") {
                    player.position = 10;
                    player.isInJail = true;
                    player.jailTurnsRemaining = 3;
                    return { requiresPurchaseDecision: false, newPosition: 10 };
                }
                if (card.subaction === "getout") {
                    player.getoutCards += 1;
                    if (card.title.includes("traded")) {
                        chanceGetOutOwner = player.id;
                    }
                    else {
                        chestGetOutOwner = player.id;
                    }
                }
                return { requiresPurchaseDecision: false };
            case "move": {
                let targetPos;
                let passedGo = false;
                if (card.tileid) {
                    targetPos = propertyById.get(card.tileid)?.posistion;
                    if (targetPos !== undefined && targetPos < player.position)
                        passedGo = true;
                }
                else if (card.count !== undefined) {
                    const raw = player.position + card.count;
                    targetPos = ((raw % 40) + 40) % 40;
                    if (card.count > 0 && raw >= 40)
                        passedGo = true;
                }
                if (targetPos === undefined)
                    return { requiresPurchaseDecision: false };
                if (passedGo)
                    player.balance += 200;
                player.position = targetPos;
                const prop = propertyByPosition.get(targetPos);
                if (prop && CARD_TILES.has(prop.id ?? "")) {
                    const deck = prop.id === "chance" ? monopoly_json_1.default.chance : monopoly_json_1.default.communitychest;
                    let nextCard = deck[Math.floor(Math.random() * deck.length)];
                    if (nextCard.action === "jail" && nextCard.subaction === "getout") {
                        const isChance = prop.id === "chance";
                        const alreadyHeld = isChance ? (chanceGetOutOwner !== null) : (chestGetOutOwner !== null);
                        if (alreadyHeld) {
                            const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
                            nextCard = filtered[Math.floor(Math.random() * filtered.length)];
                        }
                    }
                    emitServerHistory(`${player.username} landed on ${prop.id === "chance" ? "Chance" : "Community Chest"} space and drew card: "${nextCard.title}"`);
                    const result = resolveCard(player, nextCard, rolls);
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
                        }
                    };
                }
                const landing = processLanding(player, targetPos, rolls);
                return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: targetPos, landingNote: landing.landingNote };
            }
            case "movenearest": {
                const group = card.groupid === "utility" ? "Utilities" : "Railroad";
                const positions = monopoly_json_1.default.properties
                    .filter((p) => p.group === group)
                    .map((p) => p.posistion ?? 0)
                    .sort((a, b) => a - b);
                let nearest = positions[0];
                for (const pos of positions) {
                    if (pos > player.position) {
                        nearest = pos;
                        break;
                    }
                }
                if (nearest <= player.position)
                    player.balance += 200; // wrapped past Go
                player.position = nearest;
                if (group === "Utilities") {
                    const d1 = Math.floor(Math.random() * 6) + 1;
                    const d2 = Math.floor(Math.random() * 6) + 1;
                    const landing = processLanding(player, nearest, d1 + d2, card.rentmultiplier ?? 1);
                    return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: nearest, extraRoll: [d1, d2], landingNote: landing.landingNote };
                }
                const landing = processLanding(player, nearest, rolls, card.rentmultiplier ?? 1);
                return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: nearest, landingNote: landing.landingNote };
            }
            case "propertycharges": {
                const houses = player.properties
                    .filter((p) => typeof p.count === "number" && p.count > 0)
                    .reduce((s, p) => s + p.count, 0);
                const hotels = player.properties.filter((p) => p.count === "h").length;
                player.balance -= (card.buildings ?? 0) * houses + (card.hotels ?? 0) * hotels;
                return { requiresPurchaseDecision: false };
            }
            default:
                return { requiresPurchaseDecision: false };
        }
    }
    function startAuction(position) {
        const prop = propertyByPosition.get(position);
        if (!prop)
            return;
        if (auctionIntervalId)
            clearInterval(auctionIntervalId);
        currentAuction = {
            propertyPosition: position,
            currentBid: 0,
            currentBidderId: "",
            timerSeconds: 20,
            bids: []
        };
        EmitAll("auction-start", {
            position,
            name: prop.name,
            price: prop.price,
            startingBid: 1,
            timerSeconds: 20,
            bids: []
        });
        emitServerHistory(`Auction started for ${prop.name} (list price: $${prop.price})`);
        auctionIntervalId = setInterval(() => {
            if (!currentAuction) {
                if (auctionIntervalId)
                    clearInterval(auctionIntervalId);
                return;
            }
            currentAuction.timerSeconds -= 1;
            EmitAll("auction-tick", { timerSeconds: currentAuction.timerSeconds });
            if (currentAuction.timerSeconds <= 0) {
                if (auctionIntervalId)
                    clearInterval(auctionIntervalId);
                endAuction();
            }
        }, 1000);
    }
    function endAuction() {
        if (!currentAuction)
            return;
        const auction = currentAuction;
        currentAuction = null;
        if (auctionIntervalId)
            clearInterval(auctionIntervalId);
        if (auction.currentBidderId === "" || auction.currentBid === 0) {
            EmitAll("auction-skip", { position: auction.propertyPosition });
            emitServerHistory(`Auction ended with no bids — property returned to Bank`);
            EmitStateUpdate();
            return;
        }
        const winnerClient = Clients.get(auction.currentBidderId);
        const prop = propertyByPosition.get(auction.propertyPosition);
        if (!winnerClient || !prop)
            return;
        const winner = winnerClient.player;
        winner.balance -= auction.currentBid;
        winner.properties.push({
            posistion: auction.propertyPosition,
            count: 0,
            group: prop.group ?? "",
        });
        EmitAll("auction-end", {
            winnerId: winner.id,
            winnerName: winner.username,
            bid: auction.currentBid,
            position: auction.propertyPosition,
        });
        emitServerHistory(`${winner.username} won the auction for ${prop.name} at $${auction.currentBid}`);
        EmitStateUpdate();
    }
    // ── WebSocket server ──────────────────────────────────────────────────────
    const gameServer = new sockets_1.Server((server) => {
        server.clientsCount = () => Clients.size;
        server.maxPlayers = maxPlayers;
        server.gameStarted = () => gameStarted;
        server.hostName = () => {
            const hostClient = Clients.get(hostId);
            return hostClient ? hostClient.player.username : "Unknown";
        };
        server.hostId = () => hostId;
        server.setHostId = (id) => { hostId = id; };
        f?.(server.code, server);
    }, (socket, server) => {
        let isReconnecting = Clients.has(socket.id);
        socket.emit("state", isReconnecting ? 0 : (Clients.size < maxPlayers && !gameStarted ? 0 : gameStarted ? 1 : 2));
        socket.on("name", (name) => {
            try {
                let client = Clients.get(socket.id);
                isReconnecting = client !== undefined;
                if (!isReconnecting) {
                    const usedIcons = Array.from(Clients.values()).map(c => c.player.icon);
                    let availableIcon = 0;
                    for (let i = 0; i < 6; i++) {
                        if (!usedIcons.includes(i)) {
                            availableIcon = i;
                            break;
                        }
                    }
                    const player = new Player(socket.id, name, availableIcon, selectedMode.startingCash);
                    if (currentId === "" || !Array.from(Clients.keys()).includes(currentId))
                        currentId = socket.id;
                    client = { player, socket, ready: false, positions: { x: 0, y: 0 }, connected: true };
                    Clients.set(socket.id, client);
                    if (hostId === "") {
                        hostId = socket.id;
                    }
                }
                else {
                    // Two-tab fix: disconnect the old socket before adopting the new one.
                    // The old socket's disconnect event is harmless because the dc.socket
                    // guard below will detect it as an orphaned socket and return early.
                    const oldSocket = client.socket;
                    client.socket = socket;
                    client.connected = true;
                    client.player.connected = true;
                    client.socket.emit("assign_id", socket.id);
                    if (oldSocket !== socket)
                        oldSocket.disconnect();
                }
                // Clear idle / empty-room cleanup timer now that a player is here.
                server.clearCleanupTimer();
                const player = client.player;
                const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" has ${isReconnecting ? "reconnected" : "connected"}.`;
                server.logFunction(logMsg);
                logs_strings.push(logMsg);
                socket.emit("initials", {
                    turn_id: currentId,
                    other_players: Array.from(Clients.values()).map((x) => x.player.to_json()),
                    selectedMode,
                    logs: logs_strings,
                    gameStarted: gameStarted,
                    hostId: hostId,
                });
                if (!isReconnecting)
                    EmitExcepts(socket.id, "new-player", player.to_json());
                else
                    EmitExcepts(socket.id, "player_update", { playerId: player.id, pJson: player.to_json() });
                // ── Select Icon/Color ──
                socket.on("select_icon", (iconIndex) => {
                    try {
                        if (gameStarted)
                            return;
                        if (iconIndex < 0 || iconIndex > 5)
                            return;
                        const isTaken = Array.from(Clients.values()).some((c) => c.player.id !== socket.id && c.player.icon === iconIndex);
                        if (isTaken)
                            return;
                        const c = Clients.get(socket.id);
                        if (c) {
                            c.player.icon = iconIndex;
                            emitServerHistory(`${c.player.username} changed color/avatar.`);
                            EmitStateUpdate();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Kick Player (Host only) ──
                socket.on("kick-player", (targetId) => {
                    try {
                        if (socket.id !== hostId)
                            return;
                        const target = Clients.get(targetId);
                        if (target) {
                            target.socket.emit("kicked");
                            target.socket.disconnect();
                            Clients.delete(targetId);
                            if (currentId === targetId) {
                                const arr = Array.from(Clients.values()).filter((v) => v.player.balance > 0).map((v) => v.player.id);
                                currentId = arr.length > 0 ? arr[0] : "";
                            }
                            EmitAll("disconnected-player", { id: targetId, turn: currentId, wasInGame: gameStarted });
                            EmitStateUpdate();
                            // Destroy room immediately if it is now empty
                            if (Clients.size === 0)
                                server.destroy();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Unjail ────────────────────────────────────────────────
                socket.on("unjail", (option) => {
                    try {
                        if (currentId !== socket.id)
                            return;
                        if (player.hasRolled)
                            return;
                        if (!player.isInJail)
                            return;
                        if (option === "pay") {
                            player.balance -= 50;
                            emitServerHistory(`${player.username} paid $50 to leave jail`);
                        }
                        else if (option === "card" && player.getoutCards > 0) {
                            player.getoutCards -= 1;
                            if (chanceGetOutOwner === player.id) {
                                chanceGetOutOwner = null;
                            }
                            else if (chestGetOutOwner === player.id) {
                                chestGetOutOwner = null;
                            }
                            emitServerHistory(`${player.username} used a Get Out of Jail Free card to leave jail`);
                        }
                        else {
                            return;
                        }
                        player.isInJail = false;
                        player.jailTurnsRemaining = 0;
                        EmitAll("unjail", { to: player.id, option });
                        EmitStateUpdate();
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Roll Dice ─────────────────────────────────────────────
                socket.on("roll_dice", () => {
                    try {
                        if (currentId !== socket.id)
                            return;
                        // Guard: bankrupt players cannot roll
                        if (player.isBankrupt)
                            return;
                        // Guard: insolvent players must declare bankruptcy before rolling again
                        if (player.balance < 0)
                            return;
                        // Guard: already rolled and no roll again allowed
                        if (player.hasRolled && !player.allowRollAgain)
                            return;
                        let rolledD1 = Math.floor(Math.random() * 6) + 1;
                        let rolledD2 = Math.floor(Math.random() * 6) + 1;
                        const override = debugDiceOverrideMap.get(socket.id);
                        if (override) {
                            rolledD1 = override.d1;
                            rolledD2 = override.d2;
                            debugDiceOverrideMap.delete(socket.id);
                            server.logFunction(`[DEBUG] Applying dice override for ${player.username}: [${rolledD1}, ${rolledD2}]`);
                        }
                        const d1 = rolledD1;
                        const d2 = rolledD2;
                        const sum = d1 + d2;
                        const logStr = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" rolled a [${d1},${d2}].`;
                        logs_strings.push(logStr);
                        server.logFunction(logStr);
                        // ── In Jail branch ──
                        let forcedJailPayment = 0; // Fix #6: tracks forced $50 on 3rd jail attempt
                        // Fix 1: capture jail state BEFORE it may be cleared, to block re-roll on escape
                        const startedInJail = player.isInJail;
                        if (player.isInJail) {
                            const doubles = d1 === d2;
                            if (!doubles) {
                                player.jailTurnsRemaining = Math.max(0, player.jailTurnsRemaining - 1);
                                // Fix #6: On the 3rd failed attempt (jailTurnsRemaining hits 0),
                                // classic rules require the player to pay $50 and move that roll.
                                // We fall through to normal roll processing instead of returning.
                                if (player.jailTurnsRemaining === 0) {
                                    player.balance -= 50;
                                    forcedJailPayment = 50;
                                    player.isInJail = false;
                                    emitServerHistory(`${player.username} paid $50 (forced) and was released from Jail after 3 failed attempts`);
                                    // DO NOT return — fall through to normal movement below
                                }
                                else {
                                    emitServerHistory(`${player.username} failed doubles roll and stayed in Jail`);
                                    player.hasRolled = true;
                                    player.allowRollAgain = false;
                                    EmitAll("dice_roll_result", {
                                        listOfNums: [d1, d2, player.position],
                                        turnId: currentId,
                                        passedGo: false, goPayment: 0,
                                        goingToJail: false, jailStayed: true, jailEscape: false,
                                        rolledPosition: player.position, finalPosition: player.position,
                                        requiresPurchaseDecision: false, pendingCard: null, landingNote: "",
                                        forcedJailPayment: 0,
                                    });
                                    EmitStateUpdate();
                                    return;
                                }
                            }
                            else {
                                // Doubles — escape jail, fall through to normal roll
                                player.isInJail = false;
                                player.jailTurnsRemaining = 0;
                                emitServerHistory(`${player.username} rolled doubles [${d1}, ${d2}] and escaped Jail!`);
                            }
                        }
                        // ── Normal roll ──
                        const isDoubles = d1 === d2;
                        // Phase 2D: Track consecutive doubles (jail-escape doubles don't count)
                        if (!player.isInJail) {
                            if (isDoubles) {
                                const streak = (consecutiveDoublesMap.get(socket.id) ?? 0) + 1;
                                consecutiveDoublesMap.set(socket.id, streak);
                                if (streak >= 3) {
                                    // 3rd consecutive double — Go to Jail immediately
                                    consecutiveDoublesMap.set(socket.id, 0);
                                    player.position = 10;
                                    player.isInJail = true;
                                    player.jailTurnsRemaining = 3;
                                    emitServerHistory(`${player.username} rolled doubles 3 times in a row and goes to Jail!`);
                                    player.hasRolled = true;
                                    player.allowRollAgain = false;
                                    EmitAll("dice_roll_result", {
                                        listOfNums: [d1, d2, 30],
                                        turnId: currentId,
                                        passedGo: false, goPayment: 0,
                                        goingToJail: true, jailStayed: false, jailEscape: false,
                                        rolledPosition: 30, finalPosition: 10,
                                        requiresPurchaseDecision: false, pendingCard: null, landingNote: "",
                                        forcedJailPayment: 0,
                                        allowRollAgain: false,
                                    });
                                    EmitStateUpdate();
                                    return;
                                }
                            }
                            else {
                                consecutiveDoublesMap.set(socket.id, 0);
                            }
                        }
                        const oldPos = player.position;
                        const rolledPosition = (oldPos + sum) % 40;
                        const passedGo = (oldPos + sum) >= 40;
                        if (passedGo) {
                            player.balance += 200;
                            emitServerHistory(`${player.username} passed Go and collected $200`);
                        }
                        let finalPosition = rolledPosition;
                        let goingToJail = false;
                        let pendingCard = null;
                        let requiresPurchaseDecision = false;
                        let landingNote = "";
                        if (rolledPosition === 30) {
                            // Go to Jail
                            finalPosition = 10;
                            player.position = 10;
                            player.isInJail = true;
                            player.jailTurnsRemaining = 3;
                            goingToJail = true;
                            emitServerHistory(`${player.username} goes to jail`);
                        }
                        else {
                            player.position = rolledPosition;
                            const prop = propertyByPosition.get(rolledPosition);
                            if (prop && CARD_TILES.has(prop.id ?? "")) {
                                const deck = prop.id === "chance" ? monopoly_json_1.default.chance : monopoly_json_1.default.communitychest;
                                let card = deck[Math.floor(Math.random() * deck.length)];
                                if (card.action === "jail" && card.subaction === "getout") {
                                    const isChance = prop.id === "chance";
                                    const alreadyHeld = isChance ? (chanceGetOutOwner !== null) : (chestGetOutOwner !== null);
                                    if (alreadyHeld) {
                                        const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
                                        card = filtered[Math.floor(Math.random() * filtered.length)];
                                    }
                                }
                                const balanceBeforeCard = player.balance;
                                const result = resolveCard(player, card, sum);
                                if (result.newPosition !== undefined) {
                                    finalPosition = result.newPosition;
                                    player.position = finalPosition;
                                }
                                pendingCard = {
                                    element: card,
                                    is_chance: prop.id === "chance",
                                    requiresPurchaseDecision: result.requiresPurchaseDecision,
                                    newPosition: result.newPosition,
                                    extraRoll: result.extraRoll ?? null,
                                    pendingCard: result.pendingCard ?? null,
                                };
                                requiresPurchaseDecision = result.requiresPurchaseDecision;
                                emitServerHistory(`${player.username} drew ${prop.id === "chance" ? "Chance" : "Community Chest"}: "${card.title}"`);
                                // Check if card movement crossed GO
                                if (player.balance >= balanceBeforeCard + 200 && (card.action === "move" || card.action === "movenearest")) {
                                    emitServerHistory(`${player.username} passed Go and collected $200`);
                                }
                                // Capture landingNote from card resolution!
                                if (result.landingNote) {
                                    const cardLandingNote = result.landingNote;
                                    if (cardLandingNote.startsWith("incometax")) {
                                        emitServerHistory(`${player.username} paid $200 Income Tax`);
                                        creditorMap.set(player.id, "bank"); // Phase 2E
                                    }
                                    else if (cardLandingNote.startsWith("luxerytax")) {
                                        emitServerHistory(`${player.username} paid $100 Luxury Tax`);
                                        creditorMap.set(player.id, "bank"); // Phase 2E
                                    }
                                    else if (cardLandingNote.startsWith("rent:")) {
                                        const [, ownerId, rentAmt] = cardLandingNote.split(":");
                                        const ownerName = Clients.get(ownerId)?.player.username ?? "someone";
                                        emitServerHistory(`${player.username} paid $${rentAmt} rent to ${ownerName}`);
                                        creditorMap.set(player.id, ownerId); // Phase 2E
                                    }
                                }
                            }
                            else {
                                const landing = processLanding(player, rolledPosition, sum);
                                requiresPurchaseDecision = landing.requiresPurchaseDecision;
                                landingNote = landing.landingNote;
                                if (landingNote.startsWith("incometax")) {
                                    emitServerHistory(`${player.username} paid $200 Income Tax`);
                                    creditorMap.set(player.id, "bank"); // Phase 2E
                                }
                                else if (landingNote.startsWith("luxerytax")) {
                                    emitServerHistory(`${player.username} paid $100 Luxury Tax`);
                                    creditorMap.set(player.id, "bank"); // Phase 2E
                                }
                                else if (landingNote.startsWith("rent:")) {
                                    const [, ownerId, rentAmt] = landingNote.split(":");
                                    const ownerName = Clients.get(ownerId)?.player.username ?? "someone";
                                    emitServerHistory(`${player.username} paid $${rentAmt} rent to ${ownerName}`);
                                    creditorMap.set(player.id, ownerId); // Phase 2E
                                    // Track deferred rent if player couldn't afford it
                                    const rentNum = parseInt(rentAmt, 10);
                                    if (player.balance < 0) {
                                        debtAmountMap.set(player.id, { creditorId: ownerId, amount: rentNum });
                                    }
                                }
                            }
                        }
                        // If not going to jail, and didn't stay/escape jail, log standard roll
                        if (!goingToJail) {
                            const propName = propertyByPosition.get(rolledPosition)?.name ?? "";
                            emitServerHistory(`${player.username} rolled [${d1}, ${d2}] moving to "${propName}"`);
                        }
                        player.hasRolled = true;
                        // Fix 1: jail-escape doubles must NOT grant an extra roll
                        player.allowRollAgain = isDoubles && !goingToJail && !player.isInJail && !startedInJail;
                        EmitAll("dice_roll_result", {
                            listOfNums: [d1, d2, rolledPosition],
                            turnId: currentId,
                            passedGo, goPayment: passedGo ? 200 : 0,
                            goingToJail, jailStayed: false, jailEscape: false,
                            rolledPosition, finalPosition,
                            requiresPurchaseDecision, pendingCard, landingNote,
                            forcedJailPayment,
                            // Phase 2E: allow re-roll on doubles (unless going to jail)
                            allowRollAgain: player.allowRollAgain,
                        });
                        EmitStateUpdate();
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Player Action (buy / upgrade / skip) ──────────────────
                socket.on("player_action", (args) => {
                    try {
                        if (currentId !== socket.id)
                            return;
                        const prop = propertyByPosition.get(player.position);
                        if (args.action === "buy") {
                            if (!prop || prop.price === undefined)
                                return;
                            player.balance -= prop.price;
                            player.properties.push({ posistion: player.position, count: 0, group: prop.group ?? "" });
                            logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${player.username}" bought ${prop.name ?? player.position}.`);
                            server.logFunction(`{${getCurrentTime()}} Player "${player.username}" bought ${prop.name ?? player.position}.`);
                            emitServerHistory(`${player.username} bought ${prop.name ?? "a property"}`);
                        }
                        else if (args.action === "buy-advance") {
                            const targetPosition = args.propertyPosition !== undefined ? args.propertyPosition : player.position;
                            const targetProp = propertyByPosition.get(targetPosition);
                            const idx = player.properties.findIndex((p) => p.posistion === targetPosition);
                            if (idx === -1)
                                return;
                            // Fix 2: Server-side build validation
                            if (!targetProp || targetProp.group === "Railroad" || targetProp.group === "Utilities" || targetProp.group === "Special")
                                return;
                            const groupProps2 = monopoly_json_1.default.properties.filter((p) => p.group === targetProp.group);
                            const ownedInGroup2 = player.properties.filter((p) => p.group === targetProp.group);
                            if (ownedInGroup2.length !== groupProps2.length)
                                return; // must own full set
                            if (ownedInGroup2.some((p) => p.morgage === true))
                                return; // no mortgaged props in set
                            const toNum = (v) => (v === "h" ? 5 : typeof v === "number" ? v : 0);
                            const groupCounts = ownedInGroup2.map((p) => toNum(p.count));
                            const minCount = Math.min(...groupCounts);
                            if (toNum(player.properties[idx].count) > minCount)
                                return; // must build evenly
                            const expectedNext = toNum(player.properties[idx].count) + 1;
                            if (args.newCount !== expectedNext)
                                return; // must step one level at a time
                            if (args.newCount === 5) {
                                if (bankHotels < 1) {
                                    socket.emit("pool-shortage", { type: "hotel", message: "No hotels left in the Bank!" });
                                    return;
                                }
                                bankHotels -= 1;
                                bankHouses += 4;
                                player.balance -= targetProp?.ohousecost ?? 0;
                                player.properties[idx].count = "h";
                            }
                            else {
                                if (bankHouses < args.housesAdded) {
                                    socket.emit("pool-shortage", { type: "house", message: `Not enough houses left in the Bank! Only ${bankHouses} available.` });
                                    return;
                                }
                                bankHouses -= args.housesAdded;
                                player.balance -= (targetProp?.housecost ?? 0) * args.housesAdded;
                                player.properties[idx].count = args.newCount;
                            }
                            emitServerHistory(`${player.username} upgraded ${targetProp.name}`);
                        }
                        else if (args.action === "sell-advance") {
                            const targetPosition = args.propertyPosition !== undefined ? args.propertyPosition : player.position;
                            const targetProp = propertyByPosition.get(targetPosition);
                            const idx = player.properties.findIndex((p) => p.posistion === targetPosition);
                            if (idx === -1)
                                return;
                            // Fix 2: Must sell evenly — only sell from property with the most houses
                            const toNum2 = (v) => (v === "h" ? 5 : typeof v === "number" ? v : 0);
                            const ownedInGroup3 = player.properties.filter((p) => p.group === targetProp.group);
                            const maxCount = Math.max(...ownedInGroup3.map((p) => toNum2(p.count)));
                            if (toNum2(player.properties[idx].count) < maxCount)
                                return; // uneven sell rejected
                            const currentCount = player.properties[idx].count;
                            let refund = 0;
                            if (currentCount === "h") {
                                if (bankHouses < 4) {
                                    socket.emit("pool-shortage", { type: "demote-shortage", message: "Cannot sell hotel: not enough houses in the Bank to replace it!" });
                                    return;
                                }
                                bankHotels += 1;
                                bankHouses -= 4;
                                refund = Math.round((targetProp?.ohousecost ?? 0) * 0.5);
                                player.properties[idx].count = 4;
                            }
                            else if (typeof currentCount === "number" && currentCount > 0) {
                                bankHouses += 1;
                                refund = Math.round((targetProp?.housecost ?? 0) * 0.5);
                                player.properties[idx].count = currentCount - 1;
                            }
                            player.balance += refund;
                            emitServerHistory(`${player.username} demoted ${targetProp.name}`);
                        }
                        if (args.action === "skip") {
                            const landedProp = propertyByPosition.get(player.position);
                            if (landedProp && landedProp.price !== undefined && landedProp.group !== "Special") {
                                const isUnowned = Array.from(Clients.values()).every((c) => !c.player.properties.some((p) => p.posistion === player.position));
                                if (isUnowned) {
                                    startAuction(player.position);
                                }
                            }
                        }
                        EmitStateUpdate();
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Mortgage Action ───────────────────────────────────────
                socket.on("mortgage_action", (args) => {
                    try {
                        // Fix 3: Compute amounts server-side; ignore client-supplied amount
                        const idx = player.properties.findIndex((p) => p.posistion === args.propertyPosition);
                        if (idx === -1)
                            return;
                        const propData = propertyByPosition.get(args.propertyPosition);
                        if (!propData || propData.price === undefined)
                            return;
                        const ownedProp = player.properties[idx];
                        if (args.action === "mortgage") {
                            if (ownedProp.morgage === true)
                                return; // already mortgaged
                            // Cannot mortgage if any property in the color group has buildings
                            if (propData.group !== "Railroad" && propData.group !== "Utilities") {
                                const groupHasBuildings = player.properties
                                    .filter((p) => p.group === propData.group)
                                    .some((p) => p.count !== 0 && p.count !== undefined);
                                if (groupHasBuildings)
                                    return;
                            }
                            const mortgageValue = Math.round(propData.price * 0.5);
                            player.balance += mortgageValue;
                            player.properties[idx].morgage = true;
                            emitServerHistory(`${player.username} mortgaged ${propData.name} for $${mortgageValue}`);
                        }
                        else if (args.action === "unmortgage") {
                            if (ownedProp.morgage !== true)
                                return; // not mortgaged
                            const unmortgageCost = Math.round(propData.price * 0.55);
                            if (player.balance < unmortgageCost)
                                return; // cannot afford
                            player.balance -= unmortgageCost;
                            player.properties[idx].morgage = false;
                            emitServerHistory(`${player.username} unmortgaged ${propData.name} for $${unmortgageCost}`);
                        }
                        EmitStateUpdate();
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Auction Bid ──────────────────────────────────────────
                socket.on("auction-bid", (args) => {
                    try {
                        if (!currentAuction)
                            return;
                        if (player.isBankrupt)
                            return;
                        if (args.bid <= currentAuction.currentBid)
                            return;
                        if (args.bid > player.balance)
                            return;
                        currentAuction.currentBid = args.bid;
                        currentAuction.currentBidderId = socket.id;
                        currentAuction.timerSeconds = 15;
                        currentAuction.bids.push({ bidderName: player.username, amount: args.bid });
                        EmitAll("auction-update", {
                            bid: args.bid,
                            bidderId: socket.id,
                            bidderName: player.username,
                            timerSeconds: 15,
                            bids: currentAuction.bids
                        });
                        emitServerHistory(`${player.username} bid $${args.bid} at auction`);
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Finish Turn ───────────────────────────────────────
                socket.on("finish-turn", () => {
                    try {
                        if (currentId !== socket.id)
                            return;
                        // Phase 2C: Reject finish-turn if still insolvent — must declare bankruptcy
                        if (player.balance < 0)
                            return;
                        // Settle any deferred rent debt now that the player has raised enough money
                        const debt = debtAmountMap.get(socket.id);
                        if (debt) {
                            const creditorClient = Clients.get(debt.creditorId);
                            if (creditorClient) {
                                // Rent was already deducted from debtor's balance in processLanding.
                                // We only need to add it to the creditor's balance here.
                                creditorClient.player.balance += debt.amount;
                                emitServerHistory(`${player.username} settled $${debt.amount} rent debt to ${creditorClient.player.username}`);
                            }
                            debtAmountMap.delete(socket.id);
                        }
                        // Phase 2A: Reset doubles streak and creditor on clean turn end
                        consecutiveDoublesMap.set(socket.id, 0);
                        creditorMap.set(socket.id, null);
                        player.hasRolled = false;
                        player.allowRollAgain = false;
                        const active = Array.from(Clients.values()).filter((v) => !v.player.isBankrupt);
                        const arr = active.map((v) => v.player.id);
                        let i = arr.indexOf(socket.id);
                        i = arr.length > 0 ? (i + 1) % arr.length : -1;
                        currentId = i === -1 ? "" : arr[i];
                        if (active.length <= 1) {
                            for (const c of Array.from(Clients.values()))
                                c.ready = false;
                            gameStarted = false;
                            currentId = active[0]?.player.id ?? "";
                        }
                        EmitAll("turn-finished", {
                            from: socket.id,
                            turnId: currentId,
                            pJson: player.to_json(),
                            WinningMode: selectedMode.WinningMode,
                        });
                        EmitStateUpdate();
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: authenticate client for debugging ──
                socket.on("debug_authenticate", (args) => {
                    try {
                        const serverPassword = process.env.DEBUG_PASSWORD || "monopolyadmin";
                        const clientItem = Clients.get(socket.id);
                        if (clientItem) {
                            if (args && args.password === serverPassword) {
                                clientItem.isDebugAuthenticated = true;
                                socket.emit("debug_auth_success");
                                server.logFunction(`[SECURITY] Socket ${socket.id} authenticated for debugging.`);
                            }
                            else {
                                clientItem.isDebugAuthenticated = false;
                                socket.emit("debug_auth_failed", { message: "Invalid debug password" });
                                server.logFunction(`[SECURITY] Failed debug auth attempt from socket ${socket.id}`);
                            }
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // Helper: assert that client is authenticated for debugging
                const checkDebugAuth = () => {
                    const clientItem = Clients.get(socket.id);
                    if (!clientItem || !clientItem.isDebugAuthenticated) {
                        server.logFunction(`[SECURITY] Unauthorized debug action attempted from socket ${socket.id}`);
                        return false;
                    }
                    return true;
                };
                // ── DEBUG: set balance ──
                socket.on("debug_set_balance", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetId = args.targetPlayerId || socket.id;
                        const targetClient = Clients.get(targetId);
                        if (targetClient) {
                            targetClient.player.balance = args.balance ?? -1;
                            emitServerHistory(`[DEBUG] Balance of ${targetClient.player.username} set to $${args.balance}`);
                            EmitAll("debug_notice", { message: `[DEBUG] ${player.username} set balance of ${targetClient.player.username} to $${args.balance}` });
                            EmitStateUpdate();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: set turn ──
                socket.on("debug_set_turn", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetId = args.targetPlayerId || socket.id;
                        const targetClient = Clients.get(targetId);
                        if (targetClient && !targetClient.player.isBankrupt) {
                            currentId = targetId;
                            emitServerHistory(`[DEBUG] Turn forced to ${targetClient.player.username}`);
                            EmitAll("debug_notice", { message: `[DEBUG] ${player.username} forced turn to ${targetClient.player.username}` });
                            EmitAll("turn-finished", {
                                from: socket.id,
                                turnId: currentId,
                                pJson: targetClient.player.to_json(),
                                WinningMode: selectedMode.WinningMode,
                            });
                            EmitStateUpdate();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: override dice ──
                socket.on("debug_override_dice", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetId = args.targetPlayerId || socket.id;
                        const targetClient = Clients.get(targetId);
                        if (targetClient) {
                            debugDiceOverrideMap.set(targetId, { d1: args.d1, d2: args.d2 });
                            server.logFunction(`[DEBUG] Set dice override for socket ${targetId} to [${args.d1}, ${args.d2}]`);
                            emitServerHistory(`[DEBUG] Next dice roll for ${targetClient.player.username} set to [${args.d1}, ${args.d2}]`);
                            EmitAll("debug_notice", { message: `[DEBUG] ${player.username} set next dice roll for ${targetClient.player.username} to [${args.d1}, ${args.d2}]` });
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: send to jail / release ──
                socket.on("debug_send_to_jail", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetClient = Clients.get(args.targetPlayerId);
                        if (targetClient) {
                            const p = targetClient.player;
                            p.isInJail = args.inJail;
                            if (args.inJail) {
                                p.position = 10;
                                p.jailTurnsRemaining = 3;
                                emitServerHistory(`[DEBUG] ${p.username} sent to Jail`);
                                EmitAll("debug_notice", { message: `[DEBUG] ${player.username} sent ${p.username} to Jail` });
                            }
                            else {
                                p.jailTurnsRemaining = 0;
                                emitServerHistory(`[DEBUG] ${p.username} released from Jail`);
                                EmitAll("debug_notice", { message: `[DEBUG] ${player.username} released ${p.username} from Jail` });
                            }
                            EmitStateUpdate();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: teleport player to tile ──
                socket.on("debug_move_player", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetClient = Clients.get(args.targetPlayerId);
                        if (targetClient && args.position >= 0 && args.position < 40) {
                            const p = targetClient.player;
                            p.position = args.position;
                            const propName = propertyByPosition.get(args.position)?.name ?? `Tile ${args.position}`;
                            emitServerHistory(`[DEBUG] ${p.username} moved to ${propName}`);
                            EmitAll("debug_notice", { message: `[DEBUG] ${player.username} teleported ${p.username} to ${propName}` });
                            EmitStateUpdate();
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── DEBUG: force bankruptcy ──
                socket.on("debug_force_bankruptcy", (args) => {
                    try {
                        if (!checkDebugAuth())
                            return;
                        const targetClient = Clients.get(args.targetPlayerId);
                        if (targetClient && !targetClient.player.isBankrupt) {
                            targetClient.player.balance = -1;
                            if (!creditorMap.get(args.targetPlayerId)) {
                                creditorMap.set(args.targetPlayerId, "bank");
                            }
                            emitServerHistory(`[DEBUG] Bankruptcy forced on ${targetClient.player.username}`);
                            EmitAll("debug_notice", { message: `[DEBUG] ${player.username} forced bankruptcy on ${targetClient.player.username}` });
                            declareBankruptcyForPlayer(args.targetPlayerId);
                        }
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // Helper: finalize bankruptcy after all mortgage choices are resolved
                const finalizeBankruptcy = (bankruptSocketId) => {
                    const bankruptClient = Clients.get(bankruptSocketId);
                    if (!bankruptClient)
                        return;
                    const bp = bankruptClient.player;
                    bp.properties = [];
                    bp.balance = 0;
                    consecutiveDoublesMap.set(bankruptSocketId, 0);
                    creditorMap.set(bp.id, null);
                    debtAmountMap.delete(bankruptSocketId);
                    bp.hasRolled = false;
                    bp.allowRollAgain = false;
                    const active = Array.from(Clients.values()).filter((v) => !v.player.isBankrupt);
                    const arr = active.map((v) => v.player.id);
                    let i = arr.indexOf(bankruptSocketId);
                    i = arr.length > 0 ? (i + 1) % arr.length : -1;
                    currentId = i === -1 ? "" : arr[i];
                    EmitAll("player-bankrupt", {
                        bankruptId: bp.id,
                        creditorId: creditorMap.get(bp.id) ?? "bank",
                        turnId: currentId,
                        pJsons: Array.from(Clients.values()).map((c) => c.player.to_json()),
                    });
                    if (active.length <= 1) {
                        gameStarted = false;
                        for (const c of Array.from(Clients.values()))
                            c.ready = false;
                    }
                    EmitStateUpdate();
                };
                // Helper: declare bankruptcy for player
                const declareBankruptcyForPlayer = (targetId) => {
                    const clientItem = Clients.get(targetId);
                    if (!clientItem)
                        return;
                    const bpPlayer = clientItem.player;
                    server.logFunction(`[BANKRUPTCY] Player ${bpPlayer.username} is declaring bankruptcy. Balance: ${bpPlayer.balance}`);
                    if (bpPlayer.isBankrupt) {
                        server.logFunction(`[BANKRUPTCY] Player is already bankrupt.`);
                        return;
                    }
                    if (bpPlayer.balance >= 0) {
                        server.logFunction(`[BANKRUPTCY] Player balance is not negative: ${bpPlayer.balance}. Rejecting.`);
                        return;
                    }
                    bpPlayer.isBankrupt = true;
                    const creditor = creditorMap.get(bpPlayer.id) ?? "bank";
                    server.logFunction(`[BANKRUPTCY] Creditor for ${bpPlayer.username}: ${creditor}`);
                    if (creditor !== "bank") {
                        const creditorClient = Clients.get(creditor);
                        if (creditorClient) {
                            const cp = creditorClient.player;
                            server.logFunction(`[BANKRUPTCY] Found creditor player: ${cp.username}`);
                            emitServerHistory(`${bpPlayer.username} declared bankruptcy to ${cp.username}`);
                            // Transfer remaining cash to creditor (excluding the unpaid rent debt)
                            const debt = debtAmountMap.get(bpPlayer.id);
                            const rentAmt = debt ? debt.amount : 0;
                            const actualCash = bpPlayer.balance + rentAmt;
                            if (actualCash > 0) {
                                cp.balance += actualCash;
                                emitServerHistory(`${cp.username} received $${actualCash} cash from ${bpPlayer.username}`);
                            }
                            // Transfer/Release jail cards
                            if (bpPlayer.getoutCards > 0) {
                                cp.getoutCards += bpPlayer.getoutCards;
                                if (chanceGetOutOwner === bpPlayer.id) {
                                    chanceGetOutOwner = cp.id;
                                }
                                if (chestGetOutOwner === bpPlayer.id) {
                                    chestGetOutOwner = cp.id;
                                }
                                emitServerHistory(`${cp.username} received ${bpPlayer.getoutCards} Get Out of Jail Free card(s) from ${bpPlayer.username}`);
                                bpPlayer.getoutCards = 0;
                            }
                            for (const prp of bpPlayer.properties) {
                                const propData = propertyById.get(prp.posistion?.toString()) ??
                                    propertyByPosition.get(prp.posistion);
                                const propName = propData?.name ?? "a property";
                                // Liquidate buildings → 50% refund to creditor and return to bank pool
                                if (prp.count === "h") {
                                    const refund = Math.round((propData?.ohousecost ?? 0) * 0.5);
                                    cp.balance += refund;
                                    bankHotels += 1;
                                    emitServerHistory(`${cp.username} received $${refund} from hotel sold on ${propName}`);
                                }
                                else if (typeof prp.count === "number" && prp.count > 0) {
                                    const refund = Math.round((propData?.housecost ?? 0) * 0.5) * prp.count;
                                    cp.balance += refund;
                                    bankHouses += prp.count;
                                    emitServerHistory(`${cp.username} received $${refund} from ${prp.count} house(s) sold on ${propName}`);
                                }
                                prp.count = 0;
                                // Transfer property to creditor
                                cp.properties.push(prp);
                                emitServerHistory(`${cp.username} received ${propName} from ${bpPlayer.username}`);
                            }
                            // If there are mortgaged properties, pause and ask creditor
                            const mortgagedPending = cp.properties
                                .filter((prp) => prp.morgage === true || prp.morgage === "true")
                                .filter((prp) => {
                                // Only consider ones just received (from this bankrupt player)
                                return bpPlayer.properties.some((orig) => orig.posistion === prp.posistion);
                            })
                                .map((prp) => {
                                const propData = propertyByPosition.get(prp.posistion);
                                const price = propData?.price ?? 0;
                                return {
                                    position: prp.posistion,
                                    name: propData?.name ?? "Unknown",
                                    mortgageValue: Math.round(price * 0.5),
                                    interestFee: Math.round(price * 0.05),
                                    unmortgageCost: Math.round(price * 0.55),
                                };
                            });
                            if (mortgagedPending.length > 0) {
                                pendingBankruptMap.set(creditor, targetId);
                                creditorClient.socket.emit("mortgage-transfer-pending", {
                                    properties: mortgagedPending,
                                    bankruptName: bpPlayer.username,
                                });
                                EmitStateUpdate();
                                return;
                            }
                            finalizeBankruptcy(targetId);
                        }
                        else {
                            server.logFunction(`[BANKRUPTCY] Creditor client not found for id: ${creditor}`);
                        }
                    }
                    else {
                        emitServerHistory(`${bpPlayer.username} declared bankruptcy to the Bank`);
                        if (bpPlayer.getoutCards > 0) {
                            if (chanceGetOutOwner === bpPlayer.id) {
                                chanceGetOutOwner = null;
                            }
                            if (chestGetOutOwner === bpPlayer.id) {
                                chestGetOutOwner = null;
                            }
                            bpPlayer.getoutCards = 0;
                        }
                        for (const prp of bpPlayer.properties) {
                            const propData = propertyById.get(prp.posistion?.toString()) ??
                                propertyByPosition.get(prp.posistion);
                            const propName = propData?.name ?? "a property";
                            if (prp.count === "h") {
                                bankHotels += 1;
                            }
                            else if (typeof prp.count === "number" && prp.count > 0) {
                                bankHouses += prp.count;
                            }
                            prp.count = 0;
                            prp.morgage = false;
                            emitServerHistory(`${propName} was returned to the Bank`);
                        }
                        finalizeBankruptcy(targetId);
                    }
                };
                socket.on("declare-bankruptcy", () => {
                    try {
                        declareBankruptcyForPlayer(socket.id);
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // Fix 5b: Creditor resolves mortgage transfer choices
                socket.on("mortgage-transfer-resolve", (args) => {
                    try {
                        const bankruptSocketId = pendingBankruptMap.get(socket.id);
                        if (!bankruptSocketId)
                            return; // not awaiting any decisions
                        pendingBankruptMap.delete(socket.id);
                        for (const choice of args.choices) {
                            const idx = player.properties.findIndex((p) => p.posistion === choice.position);
                            if (idx === -1)
                                continue;
                            const propData = propertyByPosition.get(choice.position);
                            if (!propData)
                                continue;
                            const interestFee = Math.round((propData.price ?? 0) * 0.05);
                            const unmortgageCost = Math.round((propData.price ?? 0) * 0.55);
                            if (choice.action === "unmortgage" && player.balance >= unmortgageCost) {
                                player.balance -= unmortgageCost;
                                player.properties[idx].morgage = false;
                                emitServerHistory(`${player.username} unmortgaged ${propData.name} for $${unmortgageCost}`);
                            }
                            else {
                                // Keep mortgaged — pay only interest
                                player.balance -= interestFee;
                                emitServerHistory(`${player.username} kept ${propData.name} mortgaged, paid $${interestFee} interest`);
                            }
                        }
                        finalizeBankruptcy(bankruptSocketId);
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Message ───────────────────────────────────────
                socket.on("message", (message) => {
                    try {
                        server.logFunction(`{${getCurrentTime()}} [${socket.id}] "${Clients.get(socket.id)?.player.username}" messaged "${message}".`);
                        EmitAll("message", { from: player.username, message });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // ── Mouse ─────────────────────────────────────────────────
                socket.on("mouse", (args) => {
                    const c = Clients.get(socket.id);
                    if (!c)
                        return;
                    c.positions = args;
                    EmitExcepts(socket.id, "mouse", { id: socket.id, x: args.x, y: args.y });
                });
                // ── History ───────────────────────────────────────────────
                socket.on("history", (args) => { EmitAll("history", args); });
                // Helper: validate deal rules before committing trade to prevent cheating
                function validateAndExecuteTrade(x) {
                    if (!selectedMode.AllowDeals)
                        return false;
                    if (!x.turnPlayer.accepted || !x.againstPlayer.accepted)
                        return false;
                    const tpClient = Clients.get(x.turnPlayer.id);
                    const apClient = Clients.get(x.againstPlayer.id);
                    if (!tpClient || !apClient)
                        return false;
                    const tp = tpClient.player;
                    const ap = apClient.player;
                    if (tp.isBankrupt || ap.isBankrupt)
                        return false;
                    // 1. Cash Balance Validation
                    if (x.turnPlayer.balance < 0 || x.againstPlayer.balance < 0)
                        return false;
                    if (x.turnPlayer.balance > 0 && tp.balance < x.turnPlayer.balance)
                        return false;
                    if (x.againstPlayer.balance > 0 && ap.balance < x.againstPlayer.balance)
                        return false;
                    // Helper: check if a color group has any buildings on any properties
                    const hasGroupBuildings = (player, group) => {
                        if (!group || group === "Railroad" || group === "Utilities" || group === "Special")
                            return false;
                        return player.properties
                            .filter((p) => p.group === group)
                            .some((p) => p.count !== 0 && p.count !== undefined);
                    };
                    // 2. Turn Player Traded Properties Validation
                    for (const offer of x.turnPlayer.prop) {
                        const owned = tp.properties.find((p) => p.posistion === offer.posistion);
                        if (!owned)
                            return false; // tp doesn't own this property!
                        if (hasGroupBuildings(tp, offer.group))
                            return false; // group has buildings!
                    }
                    // 3. Against Player Traded Properties Validation
                    for (const offer of x.againstPlayer.prop) {
                        const owned = ap.properties.find((p) => p.posistion === offer.posistion);
                        if (!owned)
                            return false; // ap doesn't own this property!
                        if (hasGroupBuildings(ap, offer.group))
                            return false; // group has buildings!
                    }
                    // 4. All validations passed — transfer property ownership & cash balances
                    const tGets = ap.properties.filter((v1) => x.againstPlayer.prop.some((v2) => v2.posistion === v1.posistion));
                    ap.properties = ap.properties.filter((v1) => !x.againstPlayer.prop.some((v2) => v2.posistion === v1.posistion));
                    const aGets = tp.properties.filter((v1) => x.turnPlayer.prop.some((v2) => v2.posistion === v1.posistion));
                    tp.properties = tp.properties.filter((v1) => !x.turnPlayer.prop.some((v2) => v2.posistion === v1.posistion));
                    ap.balance -= x.againstPlayer.balance;
                    tp.balance -= x.turnPlayer.balance;
                    tp.balance += x.againstPlayer.balance;
                    ap.balance += x.turnPlayer.balance;
                    tp.properties.push(...tGets);
                    ap.properties.push(...aGets);
                    emitServerHistory(`${tp.username} done a trade with ${ap.username}`);
                    EmitAll("submit-trade", {
                        pJsons: [tp.to_json(), ap.to_json()],
                        action: `${tp.username} done a trade with ${ap.username}`,
                    });
                    EmitStateUpdate();
                    return true;
                }
                // ── Trade ─────────────────────────────────────────────────
                socket.on("trade", () => { if (!selectedMode.AllowDeals)
                    return; EmitAll("trade", {}); });
                socket.on("cancel-trade", () => { if (!selectedMode.AllowDeals)
                    return; EmitAll("cancel-trade", {}); });
                socket.on("trade-update", (x) => {
                    if (!selectedMode.AllowDeals)
                        return;
                    if (x.turnPlayer.accepted && x.againstPlayer.accepted) {
                        validateAndExecuteTrade(x);
                    }
                    else {
                        EmitAll("trade-update", x);
                    }
                });
                socket.on("submit-trade", (x) => {
                    validateAndExecuteTrade(x);
                });
                // ── Leave Room ────────────────────────────────────────────
                socket.on("leave-room", () => {
                    const lc = Clients.get(socket.id);
                    if (!lc)
                        return;
                    const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${lc.player.username}" has left the room.`;
                    server.logFunction(logMsg);
                    logs_strings.push(logMsg);
                    Clients.delete(socket.id);
                    if (hostId === socket.id) {
                        const remaining = Array.from(Clients.keys());
                        hostId = remaining.length > 0 ? remaining[0] : "";
                    }
                    if (currentId === socket.id) {
                        const arr = Array.from(Clients.values()).filter((v) => v.player.balance > 0).map((v) => v.player.id);
                        currentId = arr.length > 0 ? arr[0] : "";
                    }
                    EmitAll("disconnected-player", { id: socket.id, turn: currentId, wasInGame: gameStarted });
                    EmitStateUpdate();
                    if (Array.from(Clients.keys()).length === 0) {
                        if (gameStarted)
                            server.logFunction("Game has Ended.");
                        gameStarted = false;
                        server.destroy();
                    }
                });
            }
            catch (e) {
                server.logFunction(e);
            }
        });
        // ── Ready ─────────────────────────────────────────────────────────
        socket.on("ready", (args) => {
            try {
                const client = Clients.get(socket.id);
                if (!client)
                    return;
                if (args.ready !== undefined)
                    client.ready = args.ready;
                if (args.mode !== undefined && socket.id === hostId)
                    selectedMode = args.mode;
                Clients.set(socket.id, client);
                EmitAll("ready", { id: socket.id, state: client.ready, selectedMode });
                const readys = Array.from(Clients.values()).map((v) => v.ready);
                if (!readys.includes(false) && Clients.size >= 2) {
                    server.logFunction("Game has Started, No more Players can join the Server");
                    gameStarted = true;
                    EmitAll("start-game", {});
                }
            }
            catch (e) {
                server.logFunction(e);
            }
        });
        // ── Disconnect ────────────────────────────────────────────────────
        socket.on("disconnect", () => {
            try {
                const dc = Clients.get(socket.id);
                // Orphaned-socket guard: if this socket was replaced by a reconnect
                // (two-tab or mid-session refresh), the client entry already points at
                // the new socket. Ignore the close event from the old one.
                if (dc && dc.socket !== socket)
                    return;
                if (dc) {
                    const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${dc.player.username}" has disconnected.`;
                    server.logFunction(logMsg);
                    logs_strings.push(logMsg);
                }
                if (!gameStarted) {
                    // ── Pre-game: remove player entirely to free slot + unblock ready check ──
                    Clients.delete(socket.id);
                    // Host promotion (pre-game)
                    if (hostId === socket.id) {
                        const nextHost = Array.from(Clients.values()).find((c) => c.connected);
                        hostId = nextHost ? nextHost.player.id : "";
                        if (nextHost) {
                            const hMsg = `[Host promoted] "${nextHost.player.username}" is now the host.`;
                            server.logFunction(hMsg);
                            logs_strings.push(hMsg);
                        }
                    }
                    // Repair currentId if it pointed at the removed player
                    if (currentId === socket.id) {
                        const arr = Array.from(Clients.values()).map((v) => v.player.id);
                        currentId = arr.length > 0 ? arr[0] : "";
                    }
                    EmitAll("disconnected-player", { id: socket.id, turn: currentId, wasInGame: false });
                    EmitStateUpdate();
                    // Destroy room immediately when the last player leaves pre-game
                    if (Clients.size === 0)
                        server.destroy();
                }
                else {
                    // ── Mid-game: keep player for potential reconnect, mark disconnected ──
                    if (dc) {
                        dc.ready = false;
                        dc.connected = false;
                        dc.player.connected = false;
                    }
                    // Host promotion during active game (removed && !gameStarted guard)
                    if (hostId === socket.id) {
                        const nextHost = Array.from(Clients.values()).find((c) => c.connected && c.player.id !== socket.id);
                        if (nextHost) {
                            hostId = nextHost.player.id;
                            const hMsg = `[Host promoted] "${nextHost.player.username}" is now the host.`;
                            server.logFunction(hMsg);
                            logs_strings.push(hMsg);
                        }
                    }
                    // Turn advancement: if the disconnected player held the active turn,
                    // move it forward so the game is not permanently frozen.
                    if (currentId === socket.id && dc) {
                        dc.player.hasRolled = false;
                        dc.player.allowRollAgain = false;
                        const activeAll = Array.from(Clients.values()).filter((v) => !v.player.isBankrupt);
                        const arr = activeAll.map((v) => v.player.id);
                        let i = arr.indexOf(socket.id);
                        i = arr.length > 0 ? (i + 1) % arr.length : -1;
                        currentId = i === -1 ? "" : arr[i];
                        EmitAll("turn-finished", {
                            from: socket.id,
                            turnId: currentId,
                            pJson: dc.player.to_json(),
                            WinningMode: selectedMode.WinningMode,
                        });
                    }
                    EmitAll("disconnected-player", { id: socket.id, turn: currentId, wasInGame: true });
                    EmitStateUpdate();
                    // If everyone is gone, reset game state and start 2-min cleanup timer
                    const connectedCount = Array.from(Clients.values()).filter((c) => c.connected).length;
                    if (connectedCount === 0) {
                        server.logFunction("All players disconnected. Starting 2-minute cleanup timer.");
                        gameStarted = false;
                        server.resetCleanupTimer(2 * 60 * 1000);
                    }
                }
            }
            catch (e) {
                server.logFunction(e);
            }
        });
    });
}
exports.main = main;
