"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketHandlers = void 0;
const Player_1 = require("../game/Player");
const Board_1 = require("../game/Board");
const monopoly_json_1 = __importDefault(require("../../../shared/data/monopoly.json"));
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
function registerSocketHandlers(socket, server, state, maxPlayers) {
    let isReconnecting = state.clients.has(socket.id) || state.spectators.has(socket.id);
    socket.emit("state", isReconnecting ? 0 : state.clients.size < maxPlayers && !state.gameStarted ? 0 : state.gameStarted ? 1 : 2);
    // Wires helpers up to GameState callbacks
    state.emitAll = (event, args) => {
        for (const x of Array.from(state.clients.values()))
            x.socket.emit(event, args);
        for (const s of Array.from(state.spectators.values()))
            s.emit(event, args);
    };
    state.emitExcepts = (id, event, args) => {
        for (const [k, x] of Array.from(state.clients.entries()))
            if (k !== id)
                x.socket.emit(event, args);
        for (const [k, s] of Array.from(state.spectators.entries()))
            if (k !== id)
                s.emit(event, args);
    };
    state.emitStateUpdate = () => {
        state.emitAll("state_update", {
            players: Array.from(state.clients.values()).map((c) => c.player.to_json()),
            hostId: state.hostId,
            bankHouses: state.bankHouses,
            bankHotels: state.bankHotels,
            stats: state.gameStats,
        });
    };
    state.emitServerHistory = (actionText) => {
        const historyObj = {
            action: actionText
                .replace(/\s+/g, " ")
                .replace(/\bpayed\b/gi, "paid")
                .trim(),
            time: new Date().toJSON(),
            balances: Array.from(state.clients.values()).map((c) => ({
                username: c.player.username,
                balance: c.player.balance,
                color: getPlayerColor(c.player.icon),
            })),
        };
        state.server_histories.push(historyObj);
        state.emitAll("history", historyObj);
    };
    state.logFunction = (...data) => {
        server.logFunction(...data);
    };
    // ── Spectator Handler ───────────────────────────────────────────────────
    socket.on("spectator", (name) => {
        try {
            const isSpecReconnecting = state.spectators.has(socket.id);
            if (isSpecReconnecting) {
                const oldSocket = state.spectators.get(socket.id);
                state.spectators.set(socket.id, socket);
                if (oldSocket && oldSocket !== socket)
                    oldSocket.disconnect();
            }
            else {
                state.spectators.set(socket.id, socket);
            }
            server.clearCleanupTimer();
            const logMsg = `{${getCurrentTime()}} [${socket.id}] Spectator "${name}" has ${isSpecReconnecting ? "reconnected" : "connected"}.`;
            server.logFunction(logMsg);
            state.logs_strings.push(logMsg);
            socket.emit("initials", {
                turn_id: state.currentId,
                other_players: Array.from(state.clients.values()).map((x) => x.player.to_json()),
                selectedMode: state.selectedMode,
                logs: state.logs_strings,
                gameStarted: state.gameStarted,
                hostId: state.hostId,
                history: state.server_histories,
                stats: state.gameStats,
            });
            if (!isSpecReconnecting) {
                state.emitAll("message", { from: "System", message: `${name} is now spectating the game.` });
            }
            socket.on("message", (message) => {
                try {
                    server.logFunction(`{${getCurrentTime()}} [${socket.id}] Spectator "${name}" messaged "${message}".`);
                    state.emitAll("message", { from: `[Spectator] ${name}`, message });
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("leave-room", () => {
                state.spectators.delete(socket.id);
                server.logFunction(`{${getCurrentTime()}} [${socket.id}] Spectator "${name}" has left the room.`);
                state.emitAll("message", { from: "System", message: `${name} stopped spectating.` });
                socket.disconnect();
            });
            socket.on("disconnect", () => {
                try {
                    if (state.spectators.get(socket.id) === socket) {
                        state.spectators.delete(socket.id);
                        server.logFunction(`{${getCurrentTime()}} [${socket.id}] Spectator "${name}" has disconnected.`);
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
        }
        catch (e) {
            server.logFunction(e);
        }
    });
    // ── Name Handler ────────────────────────────────────────────────────────
    socket.on("name", (name) => {
        try {
            let client = state.clients.get(socket.id);
            isReconnecting = client !== undefined;
            if (!isReconnecting) {
                const usedIcons = Array.from(state.clients.values()).map((c) => c.player.icon);
                let availableIcon = 0;
                for (let i = 0; i < 6; i++) {
                    if (!usedIcons.includes(i)) {
                        availableIcon = i;
                        break;
                    }
                }
                const player = new Player_1.Player(socket.id, name, availableIcon, state.selectedMode.startingCash);
                state.initPlayerStats(player);
                if (state.currentId === "" || !Array.from(state.clients.keys()).includes(state.currentId))
                    state.currentId = socket.id;
                client = { player, socket, ready: false, positions: { x: 0, y: 0 }, connected: true };
                state.clients.set(socket.id, client);
                if (state.hostId === "") {
                    state.hostId = socket.id;
                }
            }
            else {
                const oldSocket = client.socket;
                client.socket = socket;
                client.connected = true;
                client.player.connected = true;
                client.socket.emit("assign_id", socket.id);
                if (oldSocket !== socket)
                    oldSocket.disconnect();
            }
            server.clearCleanupTimer();
            const player = client.player;
            const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" has ${isReconnecting ? "reconnected" : "connected"}.`;
            server.logFunction(logMsg);
            state.logs_strings.push(logMsg);
            socket.emit("initials", {
                turn_id: state.currentId,
                other_players: Array.from(state.clients.values()).map((x) => x.player.to_json()),
                selectedMode: state.selectedMode,
                logs: state.logs_strings,
                gameStarted: state.gameStarted,
                hostId: state.hostId,
                history: state.server_histories,
                stats: state.gameStats,
            });
            if (!isReconnecting)
                state.emitExcepts(socket.id, "new-player", player.to_json());
            else
                state.emitExcepts(socket.id, "player_update", { playerId: player.id, pJson: player.to_json() });
            // ── Select Icon/Color ──
            socket.on("select_icon", (iconIndex) => {
                try {
                    if (state.gameStarted)
                        return;
                    if (iconIndex < 0 || iconIndex > 5)
                        return;
                    const isTaken = Array.from(state.clients.values()).some((c) => c.player.id !== socket.id && c.player.icon === iconIndex);
                    if (isTaken)
                        return;
                    const c = state.clients.get(socket.id);
                    if (c) {
                        c.player.icon = iconIndex;
                        state.emitServerHistory(`${c.player.username} changed color/avatar.`);
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Kick Player ──
            socket.on("kick-player", (targetId) => {
                try {
                    if (socket.id !== state.hostId)
                        return;
                    const target = state.clients.get(targetId);
                    if (target) {
                        target.socket.emit("kicked");
                        target.socket.disconnect();
                        state.clients.delete(targetId);
                        if (state.currentId === targetId) {
                            const arr = Array.from(state.clients.values())
                                .filter((v) => v.player.balance > 0)
                                .map((v) => v.player.id);
                            state.currentId = arr.length > 0 ? arr[0] : "";
                        }
                        state.emitAll("disconnected-player", {
                            id: targetId,
                            turn: state.currentId,
                            wasInGame: state.gameStarted,
                        });
                        state.emitStateUpdate();
                        if (state.clients.size === 0)
                            server.destroy();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Unjail ──
            socket.on("unjail", (option) => {
                try {
                    if (state.currentId !== socket.id)
                        return;
                    if (player.hasRolled)
                        return;
                    if (!player.isInJail)
                        return;
                    if (option === "pay") {
                        player.balance -= 50;
                        state.emitServerHistory(`${player.username} paid $50 to leave jail`);
                    }
                    else if (option === "card" && player.getoutCards > 0) {
                        player.getoutCards -= 1;
                        if (state.chanceGetOutOwner === player.id) {
                            state.chanceGetOutOwner = null;
                        }
                        else if (state.chestGetOutOwner === player.id) {
                            state.chestGetOutOwner = null;
                        }
                        state.emitServerHistory(`${player.username} used a Get Out of Jail Free card to leave jail`);
                    }
                    else {
                        return;
                    }
                    player.isInJail = false;
                    player.jailTurnsRemaining = 0;
                    state.emitAll("unjail", { to: player.id, option });
                    state.emitStateUpdate();
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Roll Dice ──
            socket.on("roll_dice", () => {
                try {
                    if (state.currentId !== socket.id)
                        return;
                    if (player.isBankrupt)
                        return;
                    if (player.balance < 0)
                        return;
                    if (player.hasRolled && !player.allowRollAgain)
                        return;
                    let rolledD1 = Math.floor(Math.random() * 6) + 1;
                    let rolledD2 = Math.floor(Math.random() * 6) + 1;
                    const override = state.debugDiceOverrideMap.get(socket.id);
                    if (override) {
                        rolledD1 = override.d1;
                        rolledD2 = override.d2;
                        state.debugDiceOverrideMap.delete(socket.id);
                        server.logFunction(`[DEBUG] Applying dice override for ${player.username}: [${rolledD1}, ${rolledD2}]`);
                    }
                    const d1 = rolledD1;
                    const d2 = rolledD2;
                    const sum = d1 + d2;
                    const logStr = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" rolled a [${d1},${d2}].`;
                    state.logs_strings.push(logStr);
                    server.logFunction(logStr);
                    state.gameStats.diceRolls[sum] = (state.gameStats.diceRolls[sum] || 0) + 1;
                    const pStats = state.gameStats.playerStats[player.id];
                    if (pStats && d1 === d2) {
                        pStats.doublesRolled += 1;
                        pStats.luckyEvents += 1;
                        pStats.cumulativeLuck += 0.3;
                        pStats.luckEventsCount += 1;
                    }
                    let forcedJailPayment = 0;
                    const startedInJail = player.isInJail;
                    if (player.isInJail) {
                        const doubles = d1 === d2;
                        if (!doubles) {
                            player.jailTurnsRemaining = Math.max(0, player.jailTurnsRemaining - 1);
                            if (player.jailTurnsRemaining === 0) {
                                player.balance -= 50;
                                forcedJailPayment = 50;
                                player.isInJail = false;
                                state.emitServerHistory(`${player.username} paid $50 (forced) and was released from Jail after 3 failed attempts`);
                            }
                            else {
                                state.emitServerHistory(`${player.username} failed doubles roll and stayed in Jail`);
                                const pStatsJail = state.gameStats.playerStats[player.id];
                                if (pStatsJail) {
                                    pStatsJail.unluckyEvents += 1;
                                    pStatsJail.cumulativeLuck -= 0.16;
                                    pStatsJail.luckEventsCount += 1;
                                }
                                player.hasRolled = true;
                                player.allowRollAgain = false;
                                state.emitAll("dice_roll_result", {
                                    listOfNums: [d1, d2, player.position],
                                    turnId: state.currentId,
                                    passedGo: false,
                                    goPayment: 0,
                                    goingToJail: false,
                                    jailStayed: true,
                                    jailEscape: false,
                                    rolledPosition: player.position,
                                    finalPosition: player.position,
                                    requiresPurchaseDecision: false,
                                    pendingCard: null,
                                    landingNote: "",
                                    forcedJailPayment: 0,
                                });
                                state.emitStateUpdate();
                                return;
                            }
                        }
                        else {
                            player.isInJail = false;
                            player.jailTurnsRemaining = 0;
                            const pStatsJail = state.gameStats.playerStats[player.id];
                            if (pStatsJail) {
                                pStatsJail.cumulativeLuck += 0.8;
                                pStatsJail.luckEventsCount += 1;
                            }
                            state.emitServerHistory(`${player.username} rolled doubles [${d1}, ${d2}] and escaped Jail!`);
                        }
                    }
                    const isDoubles = d1 === d2;
                    if (!player.isInJail) {
                        if (isDoubles) {
                            const streak = (state.consecutiveDoublesMap.get(socket.id) ?? 0) + 1;
                            state.consecutiveDoublesMap.set(socket.id, streak);
                            if (streak >= 3) {
                                state.consecutiveDoublesMap.set(socket.id, 0);
                                player.position = 10;
                                player.isInJail = true;
                                player.jailTurnsRemaining = 3;
                                state.gameStats.tileVisits[10] = (state.gameStats.tileVisits[10] || 0) + 1;
                                const pStatsConsecJail = state.gameStats.playerStats[player.id];
                                if (pStatsConsecJail) {
                                    pStatsConsecJail.jailCount += 1;
                                    pStatsConsecJail.unluckyEvents += 1;
                                    pStatsConsecJail.cumulativeLuck -= 0.6;
                                    pStatsConsecJail.luckEventsCount += 1;
                                }
                                state.emitServerHistory(`${player.username} rolled doubles 3 times in a row and goes to Jail!`);
                                player.hasRolled = true;
                                player.allowRollAgain = false;
                                state.emitAll("dice_roll_result", {
                                    listOfNums: [d1, d2, 30],
                                    turnId: state.currentId,
                                    passedGo: false,
                                    goPayment: 0,
                                    goingToJail: true,
                                    jailStayed: false,
                                    jailEscape: false,
                                    rolledPosition: 30,
                                    finalPosition: 10,
                                    requiresPurchaseDecision: false,
                                    pendingCard: null,
                                    landingNote: "",
                                    forcedJailPayment: 0,
                                    allowRollAgain: false,
                                });
                                state.emitStateUpdate();
                                return;
                            }
                        }
                        else {
                            state.consecutiveDoublesMap.set(socket.id, 0);
                        }
                    }
                    const oldPos = player.position;
                    const rolledPosition = (oldPos + sum) % 40;
                    const passedGo = oldPos + sum >= 40;
                    if (passedGo) {
                        player.balance += 200;
                        state.emitServerHistory(`${player.username} passed Go and collected $200`);
                    }
                    let finalPosition = rolledPosition;
                    let goingToJail = false;
                    let pendingCard = null;
                    let requiresPurchaseDecision = false;
                    let landingNote = "";
                    if (rolledPosition === 30) {
                        finalPosition = 10;
                        player.position = 10;
                        player.isInJail = true;
                        player.jailTurnsRemaining = 3;
                        goingToJail = true;
                        state.emitServerHistory(`${player.username} goes to jail`);
                        state.gameStats.tileVisits[30] = (state.gameStats.tileVisits[30] || 0) + 1;
                        state.gameStats.tileVisits[10] = (state.gameStats.tileVisits[10] || 0) + 1;
                        const pStatsJailRoll = state.gameStats.playerStats[player.id];
                        if (pStatsJailRoll) {
                            pStatsJailRoll.cumulativeLuck -= 0.6;
                            pStatsJailRoll.luckEventsCount += 1;
                            pStatsJailRoll.jailCount += 1;
                            pStatsJailRoll.unluckyEvents += 1;
                        }
                    }
                    else {
                        player.position = rolledPosition;
                        state.gameStats.tileVisits[rolledPosition] =
                            (state.gameStats.tileVisits[rolledPosition] || 0) + 1;
                        const prop = Board_1.propertyByPosition.get(rolledPosition);
                        if (prop && Board_1.CARD_TILES.has(prop.id ?? "")) {
                            const deck = prop.id === "chance" ? monopoly_json_1.default.chance : monopoly_json_1.default.communitychest;
                            let card = deck[Math.floor(Math.random() * deck.length)];
                            if (card.action === "jail" && card.subaction === "getout") {
                                const isChance = prop.id === "chance";
                                const alreadyHeld = isChance
                                    ? state.chanceGetOutOwner !== null
                                    : state.chestGetOutOwner !== null;
                                if (alreadyHeld) {
                                    const filtered = deck.filter((c) => !(c.action === "jail" && c.subaction === "getout"));
                                    card = filtered[Math.floor(Math.random() * filtered.length)];
                                }
                            }
                            const balanceBeforeCard = player.balance;
                            const result = state.resolveCard(player, card, sum);
                            const balanceAfterCard = player.balance;
                            const cardDiff = balanceAfterCard - balanceBeforeCard;
                            const pStatsCard = state.gameStats.playerStats[player.id];
                            if (pStatsCard) {
                                if (cardDiff > 0 || (card.action === "jail" && card.subaction === "getout")) {
                                    pStatsCard.cumulativeLuck += 0.5;
                                    pStatsCard.luckEventsCount += 1;
                                    pStatsCard.goodCardsDrawn += 1;
                                    pStatsCard.luckyEvents += 1;
                                }
                                else if (cardDiff < 0 || (card.action === "jail" && card.subaction === "goto")) {
                                    pStatsCard.cumulativeLuck -= 0.5;
                                    pStatsCard.luckEventsCount += 1;
                                    pStatsCard.badCardsDrawn += 1;
                                    pStatsCard.unluckyEvents += 1;
                                }
                            }
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
                            state.emitServerHistory(`${player.username} drew ${prop.id === "chance" ? "Chance" : "Community Chest"}: "${card.title}"`);
                            if (player.balance >= balanceBeforeCard + 200 &&
                                (card.action === "move" || card.action === "movenearest")) {
                                state.emitServerHistory(`${player.username} passed Go and collected $200`);
                            }
                            if (result.landingNote) {
                                landingNote = result.landingNote;
                                if (landingNote.startsWith("incometax")) {
                                    state.emitServerHistory(`${player.username} paid $200 Income Tax`);
                                    state.creditorMap.set(player.id, "bank");
                                }
                                else if (landingNote.startsWith("luxerytax")) {
                                    state.emitServerHistory(`${player.username} paid $100 Luxury Tax`);
                                    state.creditorMap.set(player.id, "bank");
                                }
                                else if (landingNote.startsWith("rent:")) {
                                    const [, ownerId, rentAmt] = landingNote.split(":");
                                    const ownerName = state.clients.get(ownerId)?.player.username ?? "someone";
                                    state.emitServerHistory(`${player.username} paid $${rentAmt} rent to ${ownerName}`);
                                    state.creditorMap.set(player.id, ownerId);
                                }
                            }
                        }
                        else {
                            const landing = state.processLanding(player, rolledPosition, sum);
                            requiresPurchaseDecision = landing.requiresPurchaseDecision;
                            landingNote = landing.landingNote;
                            if (landingNote.startsWith("incometax")) {
                                state.emitServerHistory(`${player.username} paid $200 Income Tax`);
                                state.creditorMap.set(player.id, "bank");
                            }
                            else if (landingNote.startsWith("luxerytax")) {
                                state.emitServerHistory(`${player.username} paid $100 Luxury Tax`);
                                state.creditorMap.set(player.id, "bank");
                            }
                            else if (landingNote.startsWith("rent:")) {
                                const [, ownerId, rentAmt] = landingNote.split(":");
                                const ownerName = state.clients.get(ownerId)?.player.username ?? "someone";
                                state.emitServerHistory(`${player.username} paid $${rentAmt} rent to ${ownerName}`);
                                state.creditorMap.set(player.id, ownerId);
                                const rentNum = parseInt(rentAmt, 10);
                                if (player.balance < 0) {
                                    state.debtAmountMap.set(player.id, { creditorId: ownerId, amount: rentNum });
                                }
                            }
                        }
                    }
                    if (!goingToJail) {
                        const propName = Board_1.propertyByPosition.get(rolledPosition)?.name ?? "";
                        state.emitServerHistory(`${player.username} rolled [${d1}, ${d2}] moving to "${propName}"`);
                    }
                    player.hasRolled = true;
                    player.allowRollAgain = isDoubles && !goingToJail && !player.isInJail && !startedInJail;
                    state.emitAll("dice_roll_result", {
                        listOfNums: [d1, d2, rolledPosition],
                        turnId: state.currentId,
                        passedGo,
                        goPayment: passedGo ? 200 : 0,
                        goingToJail,
                        jailStayed: false,
                        jailEscape: false,
                        rolledPosition,
                        finalPosition,
                        requiresPurchaseDecision,
                        pendingCard,
                        landingNote,
                        forcedJailPayment,
                        allowRollAgain: player.allowRollAgain,
                    });
                    state.emitStateUpdate();
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Player Action (buy / upgrade / skip) ──
            socket.on("player_action", (args) => {
                try {
                    if (state.currentId !== socket.id)
                        return;
                    const prop = Board_1.propertyByPosition.get(player.position);
                    if (args.action === "buy") {
                        if (!prop || prop.price === undefined)
                            return;
                        player.balance -= prop.price;
                        player.properties.push({ posistion: player.position, count: 0, group: prop.group ?? "" });
                        state.logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${player.username}" bought ${prop.name ?? player.position}.`);
                        server.logFunction(`{${getCurrentTime()}} Player "${player.username}" bought ${prop.name ?? player.position}.`);
                        state.emitServerHistory(`${player.username} bought ${prop.name ?? "a property"}`);
                        if (prop.group && prop.group !== "Special") {
                            const groupProps = monopoly_json_1.default.properties.filter((p) => p.group === prop.group);
                            const ownedGroup = player.properties.filter((p) => p.group === prop.group);
                            if (groupProps.length > 0 && ownedGroup.length === groupProps.length) {
                                state.emitServerHistory(`${player.username} completed the ${prop.group} color group monopoly!`);
                            }
                        }
                    }
                    else if (args.action === "buy-advance") {
                        const targetPosition = args.propertyPosition !== undefined ? args.propertyPosition : player.position;
                        const targetProp = Board_1.propertyByPosition.get(targetPosition);
                        const idx = player.properties.findIndex((p) => p.posistion === targetPosition);
                        if (idx === -1)
                            return;
                        if (!targetProp ||
                            targetProp.group === "Railroad" ||
                            targetProp.group === "Utilities" ||
                            targetProp.group === "Special")
                            return;
                        const groupProps2 = monopoly_json_1.default.properties.filter((p) => p.group === targetProp.group);
                        const ownedInGroup2 = player.properties.filter((p) => p.group === targetProp.group);
                        if (ownedInGroup2.length !== groupProps2.length)
                            return;
                        if (ownedInGroup2.some((p) => p.morgage === true))
                            return;
                        const toNum = (v) => (v === "h" ? 5 : typeof v === "number" ? v : 0);
                        const groupCounts = ownedInGroup2.map((p) => toNum(p.count));
                        const minCount = Math.min(...groupCounts);
                        if (toNum(player.properties[idx].count) > minCount)
                            return;
                        const expectedNext = toNum(player.properties[idx].count) + 1;
                        if (args.newCount !== expectedNext)
                            return;
                        if (args.newCount === 5) {
                            if (state.bankHotels < 1) {
                                socket.emit("pool-shortage", { type: "hotel", message: "No hotels left in the Bank!" });
                                return;
                            }
                            state.bankHotels -= 1;
                            state.bankHouses += 4;
                            player.balance -= targetProp?.ohousecost ?? 0;
                            player.properties[idx].count = "h";
                        }
                        else {
                            if (state.bankHouses < args.housesAdded) {
                                socket.emit("pool-shortage", {
                                    type: "house",
                                    message: `Not enough houses left in the Bank! Only ${state.bankHouses} available.`,
                                });
                                return;
                            }
                            state.bankHouses -= args.housesAdded;
                            player.balance -= (targetProp?.housecost ?? 0) * args.housesAdded;
                            player.properties[idx].count = args.newCount;
                        }
                        state.emitServerHistory(`${player.username} upgraded ${targetProp.name}`);
                    }
                    else if (args.action === "sell-advance") {
                        const targetPosition = args.propertyPosition !== undefined ? args.propertyPosition : player.position;
                        const targetProp = Board_1.propertyByPosition.get(targetPosition);
                        const idx = player.properties.findIndex((p) => p.posistion === targetPosition);
                        if (idx === -1)
                            return;
                        const toNum2 = (v) => (v === "h" ? 5 : typeof v === "number" ? v : 0);
                        const ownedInGroup3 = player.properties.filter((p) => p.group === targetProp.group);
                        const maxCount = Math.max(...ownedInGroup3.map((p) => toNum2(p.count)));
                        if (toNum2(player.properties[idx].count) < maxCount)
                            return;
                        const currentCount = player.properties[idx].count;
                        let refund = 0;
                        if (currentCount === "h") {
                            if (state.bankHouses < 4) {
                                state.bankHotels += 1;
                                refund =
                                    Math.round((targetProp?.ohousecost ?? 0) * 0.5) +
                                        Math.round((targetProp?.housecost ?? 0) * 0.5) * 4;
                                player.properties[idx].count = 0;
                                state.emitServerHistory(`${player.username} sold hotel and houses on ${targetProp.name} due to Bank shortage`);
                            }
                            else {
                                state.bankHotels += 1;
                                state.bankHouses -= 4;
                                refund = Math.round((targetProp?.ohousecost ?? 0) * 0.5);
                                player.properties[idx].count = 4;
                                state.emitServerHistory(`${player.username} demoted ${targetProp.name} to 4 houses`);
                            }
                        }
                        else if (typeof currentCount === "number" && currentCount > 0) {
                            state.bankHouses += 1;
                            refund = Math.round((targetProp?.housecost ?? 0) * 0.5);
                            player.properties[idx].count = (currentCount - 1);
                            state.emitServerHistory(`${player.username} demoted ${targetProp.name}`);
                        }
                        player.balance += refund;
                    }
                    if (args.action === "skip") {
                        if (!state.selectedMode.allowAuctions)
                            return;
                        const landedProp = Board_1.propertyByPosition.get(player.position);
                        if (landedProp && landedProp.price !== undefined && landedProp.group !== "Special") {
                            const isUnowned = Array.from(state.clients.values()).every((c) => !c.player.properties.some((p) => p.posistion === player.position));
                            if (isUnowned) {
                                state.startAuction(player.position);
                            }
                        }
                    }
                    state.emitStateUpdate();
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Mortgage Action ──
            socket.on("mortgage_action", (args) => {
                try {
                    if (!state.selectedMode.mortageAllowed) {
                        server.logFunction(`[SECURITY] Rejecting mortgage action from ${socket.id} because mortgages are disabled.`);
                        return;
                    }
                    const idx = player.properties.findIndex((p) => p.posistion === args.propertyPosition);
                    if (idx === -1)
                        return;
                    const propData = Board_1.propertyByPosition.get(args.propertyPosition);
                    if (!propData || propData.price === undefined)
                        return;
                    const ownedProp = player.properties[idx];
                    if (args.action === "mortgage") {
                        if (ownedProp.morgage === true)
                            return;
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
                        state.emitServerHistory(`${player.username} mortgaged ${propData.name} for $${mortgageValue}`);
                    }
                    else if (args.action === "unmortgage") {
                        if (ownedProp.morgage !== true)
                            return;
                        const unmortgageCost = Math.round(propData.price * 0.55);
                        if (player.balance < unmortgageCost)
                            return;
                        player.balance -= unmortgageCost;
                        player.properties[idx].morgage = false;
                        state.emitServerHistory(`${player.username} unmortgaged ${propData.name} for $${unmortgageCost}`);
                    }
                    state.emitStateUpdate();
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Auction Bid ──
            socket.on("auction-bid", (args) => {
                try {
                    if (!state.currentAuction)
                        return;
                    if (player.isBankrupt)
                        return;
                    if (args.bid <= state.currentAuction.currentBid)
                        return;
                    if (args.bid > player.balance)
                        return;
                    state.currentAuction.currentBid = args.bid;
                    state.currentAuction.currentBidderId = socket.id;
                    state.currentAuction.timerSeconds = 15;
                    state.currentAuction.bids.push({ bidderName: player.username, amount: args.bid });
                    state.emitAll("auction-update", {
                        bid: args.bid,
                        bidderId: socket.id,
                        bidderName: player.username,
                        timerSeconds: 15,
                        bids: state.currentAuction.bids,
                    });
                    state.emitServerHistory(`${player.username} bid $${args.bid} at auction`);
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Finish Turn ──
            socket.on("finish-turn", () => {
                try {
                    if (state.currentId !== socket.id)
                        return;
                    if (player.balance < 0)
                        return;
                    const debt = state.debtAmountMap.get(socket.id);
                    if (debt) {
                        const creditorClient = state.clients.get(debt.creditorId);
                        if (creditorClient) {
                            creditorClient.player.balance += debt.amount;
                            state.emitServerHistory(`${player.username} settled $${debt.amount} rent debt to ${creditorClient.player.username}`);
                        }
                        state.debtAmountMap.delete(socket.id);
                    }
                    state.consecutiveDoublesMap.set(socket.id, 0);
                    state.creditorMap.set(socket.id, null);
                    player.hasRolled = false;
                    player.allowRollAgain = false;
                    const active = Array.from(state.clients.values()).filter((v) => !v.player.isBankrupt);
                    const arr = active.map((v) => v.player.id);
                    let i = arr.indexOf(socket.id);
                    i = arr.length > 0 ? (i + 1) % arr.length : -1;
                    state.currentId = i === -1 ? "" : arr[i];
                    state.checkAndHandleWinCondition();
                    for (const c of Array.from(state.clients.values())) {
                        const p = c.player;
                        const pStatsNet = state.gameStats.playerStats[p.id];
                        if (pStatsNet) {
                            const nextTurnNum = pStatsNet.netWorthHistory.length;
                            pStatsNet.netWorthHistory.push({
                                turn: nextTurnNum,
                                netWorth: state.calculateNetWorth(p),
                            });
                        }
                    }
                    state.emitAll("turn-finished", {
                        from: socket.id,
                        turnId: state.currentId,
                        pJson: player.to_json(),
                        WinningMode: state.selectedMode.WinningMode,
                    });
                    state.emitStateUpdate();
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── DEBUG Authentication ──
            socket.on("debug_authenticate", (args) => {
                try {
                    const serverPassword = process.env.DEBUG_PASSWORD || "monopolyadmin";
                    const clientItem = state.clients.get(socket.id);
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
            const checkDebugAuth = () => {
                const clientItem = state.clients.get(socket.id);
                if (!clientItem || !clientItem.isDebugAuthenticated) {
                    server.logFunction(`[SECURITY] Unauthorized debug action attempted from socket ${socket.id}`);
                    return false;
                }
                return true;
            };
            socket.on("debug_set_balance", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetId = args.targetPlayerId || socket.id;
                    const targetClient = state.clients.get(targetId);
                    if (targetClient) {
                        targetClient.player.balance = args.balance ?? -1;
                        state.emitServerHistory(`[DEBUG] Balance of ${targetClient.player.username} set to $${args.balance}`);
                        state.emitAll("debug_notice", {
                            message: `[DEBUG] ${player.username} set balance of ${targetClient.player.username} to $${args.balance}`,
                        });
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("debug_set_turn", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetId = args.targetPlayerId || socket.id;
                    const targetClient = state.clients.get(targetId);
                    if (targetClient && !targetClient.player.isBankrupt) {
                        state.currentId = targetId;
                        state.emitServerHistory(`[DEBUG] Turn forced to ${targetClient.player.username}`);
                        state.emitAll("debug_notice", {
                            message: `[DEBUG] ${player.username} forced turn to ${targetClient.player.username}`,
                        });
                        state.emitAll("turn-finished", {
                            from: socket.id,
                            turnId: state.currentId,
                            pJson: targetClient.player.to_json(),
                            WinningMode: state.selectedMode.WinningMode,
                        });
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("debug_override_dice", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetId = args.targetPlayerId || socket.id;
                    const targetClient = state.clients.get(targetId);
                    if (targetClient) {
                        state.debugDiceOverrideMap.set(targetId, { d1: args.d1, d2: args.d2 });
                        server.logFunction(`[DEBUG] Set dice override for socket ${targetId} to [${args.d1}, ${args.d2}]`);
                        state.emitServerHistory(`[DEBUG] Next dice roll for ${targetClient.player.username} set to [${args.d1}, ${args.d2}]`);
                        state.emitAll("debug_notice", {
                            message: `[DEBUG] ${player.username} set next dice roll for ${targetClient.player.username} to [${args.d1}, ${args.d2}]`,
                        });
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("debug_send_to_jail", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetClient = state.clients.get(args.targetPlayerId);
                    if (targetClient) {
                        const p = targetClient.player;
                        p.isInJail = args.inJail;
                        if (args.inJail) {
                            p.position = 10;
                            p.jailTurnsRemaining = 3;
                            state.emitServerHistory(`[DEBUG] ${p.username} sent to Jail`);
                            state.emitAll("debug_notice", {
                                message: `[DEBUG] ${player.username} sent ${p.username} to Jail`,
                            });
                        }
                        else {
                            p.jailTurnsRemaining = 0;
                            state.emitServerHistory(`[DEBUG] ${p.username} released from Jail`);
                            state.emitAll("debug_notice", {
                                message: `[DEBUG] ${player.username} released ${p.username} from Jail`,
                            });
                        }
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("debug_move_player", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetClient = state.clients.get(args.targetPlayerId);
                    if (targetClient && args.position >= 0 && args.position < 40) {
                        const p = targetClient.player;
                        p.position = args.position;
                        const propName = Board_1.propertyByPosition.get(args.position)?.name ?? `Tile ${args.position}`;
                        state.emitServerHistory(`[DEBUG] ${p.username} moved to ${propName}`);
                        state.emitAll("debug_notice", {
                            message: `[DEBUG] ${player.username} teleported ${p.username} to ${propName}`,
                        });
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("debug_force_bankruptcy", (args) => {
                try {
                    if (!checkDebugAuth())
                        return;
                    const targetClient = state.clients.get(args.targetPlayerId);
                    if (targetClient && !targetClient.player.isBankrupt) {
                        targetClient.player.balance = -1;
                        if (!state.creditorMap.get(args.targetPlayerId)) {
                            state.creditorMap.set(args.targetPlayerId, "bank");
                        }
                        state.emitServerHistory(`[DEBUG] Bankruptcy forced on ${targetClient.player.username}`);
                        state.emitAll("debug_notice", {
                            message: `[DEBUG] ${player.username} forced bankruptcy on ${targetClient.player.username}`,
                        });
                        state.declareBankruptcyForPlayer(args.targetPlayerId);
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Bankruptcy ──
            socket.on("declare-bankruptcy", () => {
                try {
                    state.declareBankruptcyForPlayer(socket.id);
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            socket.on("mortgage-transfer-resolve", (args) => {
                try {
                    const isTradeResolve = state.pendingTradeMortgages.has(socket.id);
                    const bankruptSocketId = state.pendingBankruptMap.get(socket.id);
                    if (!isTradeResolve && !bankruptSocketId)
                        return;
                    if (isTradeResolve) {
                        state.pendingTradeMortgages.delete(socket.id);
                    }
                    else {
                        state.pendingBankruptMap.delete(socket.id);
                    }
                    for (const choice of args.choices) {
                        const idx = player.properties.findIndex((p) => p.posistion === choice.position);
                        if (idx === -1)
                            continue;
                        const propData = Board_1.propertyByPosition.get(choice.position);
                        if (!propData)
                            continue;
                        const interestFee = Math.round((propData.price ?? 0) * 0.05);
                        const unmortgageCost = Math.round((propData.price ?? 0) * 0.55);
                        if (choice.action === "unmortgage" && player.balance >= unmortgageCost) {
                            player.balance -= unmortgageCost;
                            player.properties[idx].morgage = false;
                            state.emitServerHistory(`${player.username} unmortgaged ${propData.name} for $${unmortgageCost}`);
                        }
                        else {
                            player.balance -= interestFee;
                            state.emitServerHistory(`${player.username} kept ${propData.name} mortgaged, paid $${interestFee} interest`);
                        }
                    }
                    if (!isTradeResolve && bankruptSocketId) {
                        state.finalizeBankruptcy(bankruptSocketId);
                    }
                    else {
                        state.emitStateUpdate();
                    }
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Message ──
            socket.on("message", (message) => {
                try {
                    server.logFunction(`{${getCurrentTime()}} [${socket.id}] "${state.clients.get(socket.id)?.player.username}" messaged "${message}".`);
                    state.emitAll("message", { from: player.username, message });
                }
                catch (e) {
                    server.logFunction(e);
                }
            });
            // ── Mouse ──
            socket.on("mouse", (args) => {
                const c = state.clients.get(socket.id);
                if (!c)
                    return;
                c.positions = args;
                state.emitExcepts(socket.id, "mouse", { id: socket.id, x: args.x, y: args.y });
            });
            // ── History ──
            socket.on("history", (args) => {
                state.server_histories.push(args);
                state.emitAll("history", args);
            });
            // ── Trade ──
            socket.on("trade", () => {
                if (!state.selectedMode.AllowDeals)
                    return;
                state.emitAll("trade", {});
            });
            socket.on("cancel-trade", () => {
                if (!state.selectedMode.AllowDeals)
                    return;
                state.emitAll("cancel-trade", {});
            });
            socket.on("trade-update", (x) => {
                if (!state.selectedMode.AllowDeals)
                    return;
                if (x.turnPlayer.accepted && x.againstPlayer.accepted) {
                    state.validateAndExecuteTrade(x);
                }
                else {
                    state.emitAll("trade-update", x);
                }
            });
            socket.on("submit-trade", (x) => {
                state.validateAndExecuteTrade(x);
            });
            // ── Leave Room ──
            socket.on("leave-room", () => {
                const lc = state.clients.get(socket.id);
                if (!lc)
                    return;
                const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${lc.player.username}" has left the room.`;
                server.logFunction(logMsg);
                state.logs_strings.push(logMsg);
                state.clients.delete(socket.id);
                if (state.hostId === socket.id) {
                    const remaining = Array.from(state.clients.keys());
                    state.hostId = remaining.length > 0 ? remaining[0] : "";
                }
                if (state.currentId === socket.id) {
                    const arr = Array.from(state.clients.values())
                        .filter((v) => v.player.balance > 0)
                        .map((v) => v.player.id);
                    state.currentId = arr.length > 0 ? arr[0] : "";
                }
                state.emitAll("disconnected-player", {
                    id: socket.id,
                    turn: state.currentId,
                    wasInGame: state.gameStarted,
                });
                state.emitStateUpdate();
                if (state.clients.size === 0) {
                    state.gameStarted = false;
                    server.destroy();
                }
            });
        }
        catch (e) {
            server.logFunction(e);
        }
    });
    // ── Disconnect ──
    socket.on("disconnect", () => {
        try {
            const dc = state.clients.get(socket.id);
            if (dc && dc.socket !== socket)
                return;
            if (dc) {
                const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${dc.player.username}" has disconnected.`;
                server.logFunction(logMsg);
                state.logs_strings.push(logMsg);
            }
            if (!state.gameStarted) {
                state.clients.delete(socket.id);
                if (state.hostId === socket.id) {
                    const nextHost = Array.from(state.clients.values()).find((c) => c.connected);
                    state.hostId = nextHost ? nextHost.player.id : "";
                    if (nextHost) {
                        const hMsg = `[Host promoted] "${nextHost.player.username}" is now the host.`;
                        server.logFunction(hMsg);
                        state.logs_strings.push(hMsg);
                    }
                }
                if (state.currentId === socket.id) {
                    const arr = Array.from(state.clients.values()).map((v) => v.player.id);
                    state.currentId = arr.length > 0 ? arr[0] : "";
                }
                state.emitAll("disconnected-player", { id: socket.id, turn: state.currentId, wasInGame: false });
                state.emitStateUpdate();
                if (state.clients.size === 0)
                    server.destroy();
            }
            else {
                if (dc) {
                    dc.ready = false;
                    dc.connected = false;
                    dc.player.connected = false;
                }
                if (state.hostId === socket.id) {
                    const nextHost = Array.from(state.clients.values()).find((c) => c.connected && c.player.id !== socket.id);
                    if (nextHost) {
                        state.hostId = nextHost.player.id;
                        const hMsg = `[Host promoted] "${nextHost.player.username}" is now the host.`;
                        server.logFunction(hMsg);
                        state.logs_strings.push(hMsg);
                    }
                }
                if (state.currentId === socket.id && dc) {
                    dc.player.hasRolled = false;
                    dc.player.allowRollAgain = false;
                    const activeAll = Array.from(state.clients.values()).filter((v) => !v.player.isBankrupt);
                    const arr = activeAll.map((v) => v.player.id);
                    let i = arr.indexOf(socket.id);
                    i = arr.length > 0 ? (i + 1) % arr.length : -1;
                    state.currentId = i === -1 ? "" : arr[i];
                    state.emitAll("turn-finished", {
                        from: socket.id,
                        turnId: state.currentId,
                        pJson: dc.player.to_json(),
                        WinningMode: state.selectedMode.WinningMode,
                    });
                }
                state.emitAll("disconnected-player", { id: socket.id, turn: state.currentId, wasInGame: true });
                state.emitStateUpdate();
                const connectedCount = Array.from(state.clients.values()).filter((c) => c.connected).length;
                if (connectedCount === 0) {
                    server.logFunction("All players disconnected. Starting 2-minute cleanup timer.");
                    state.gameStarted = false;
                    server.resetCleanupTimer(2 * 60 * 1000);
                }
            }
        }
        catch (e) {
            server.logFunction(e);
        }
    });
    // ── Ready ──
    socket.on("ready", (args) => {
        try {
            const client = state.clients.get(socket.id);
            if (!client)
                return;
            if (args.ready !== undefined)
                client.ready = args.ready;
            if (args.mode !== undefined && socket.id === state.hostId)
                state.selectedMode = args.mode;
            state.clients.set(socket.id, client);
            state.emitAll("ready", { id: socket.id, state: client.ready, selectedMode: state.selectedMode });
            const readys = Array.from(state.clients.values()).map((v) => v.ready);
            if (!readys.includes(false) && state.clients.size >= 2) {
                for (const c of Array.from(state.clients.values())) {
                    c.player.balance = state.selectedMode.startingCash;
                    c.player.position = 0;
                    c.player.properties = [];
                    c.player.isInJail = false;
                    c.player.jailTurnsRemaining = 0;
                    c.player.getoutCards = 0;
                    c.player.isBankrupt = false;
                    c.player.hasRolled = false;
                    c.player.allowRollAgain = false;
                }
                state.server_histories.length = 0;
                state.gameStats.diceRolls = {};
                state.gameStats.tileVisits = {};
                state.gameStats.playerStats = {};
                for (const c of Array.from(state.clients.values())) {
                    state.initPlayerStats(c.player);
                }
                state.consecutiveDoublesMap.clear();
                state.creditorMap.clear();
                state.pendingBankruptMap.clear();
                state.pendingTradeMortgages.clear();
                state.debtAmountMap.clear();
                state.bankHouses = 32;
                state.bankHotels = 12;
                state.chanceGetOutOwner = null;
                state.chestGetOutOwner = null;
                state.currentAuction = null;
                if (state.auctionIntervalId) {
                    clearInterval(state.auctionIntervalId);
                    state.auctionIntervalId = null;
                }
                server.logFunction("Game has Started, No more Players can join the Server");
                state.gameStarted = true;
                state.emitAll("start-game", {});
                state.emitStateUpdate();
            }
        }
        catch (e) {
            server.logFunction(e);
        }
    });
}
exports.registerSocketHandlers = registerSocketHandlers;
