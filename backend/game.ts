import { Socket, Server } from "./sockets";
import monopolyJSON from "./monopoly.json";
import { GameTrading, MonopolyMode, MonopolyModes, historyAction } from "./types";

// ── Static lookup maps ────────────────────────────────────────────────────────
const propertyByPosition = new Map<number, any>(
    monopolyJSON.properties.map((p) => [p.posistion ?? 0, p])
);
const propertyById = new Map<string, any>(
    monopolyJSON.properties.map((p) => [p.id ?? "", p])
);
const CARD_TILES = new Set(["communitychest", "chance"]);
const INERT_TILES = new Set(["go", "jail", "freeparking"]);

// ── Player ────────────────────────────────────────────────────────────────────
class Player {
    public id: string;
    public username: string;
    public icon: number;
    public position: number;
    public balance: number;
    public properties: Array<any>;
    public isInJail: boolean;
    public jailTurnsRemaining: number;
    public getoutCards: number;

    constructor(_id: string, _name: string, _icon: number, cash?: number) {
        this.id = _id;
        this.username = _name;
        this.icon = _icon;
        this.position = 0;
        this.balance = cash ?? 1500;
        this.properties = [];
        this.isInJail = false;
        this.jailTurnsRemaining = 0;
        this.getoutCards = 0;
    }

    to_json(): PlayerJSON {
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
        };
    }

    from_json(json: PlayerJSON) {
        if (this.id !== json.id) return;
        this.position = json.position;
        this.balance = json.balance;
        this.properties = json.properties;
        this.isInJail = json.isInJail;
        this.jailTurnsRemaining = json.jailTurnsRemaining;
        this.getoutCards = json.getoutCards;
    }
}

type PlayerJSON = {
    id: string;
    username: string;
    icon: number;
    position: number;
    balance: number;
    properties: Array<any>;
    isInJail: boolean;
    jailTurnsRemaining: number;
    getoutCards: number;
};

type PlayerActionArgs =
    | { action: "buy" }
    | { action: "buy-advance"; newCount: 1 | 2 | 3 | 4 | 5; housesAdded: number }
    | { action: "skip" };

// ── Main ──────────────────────────────────────────────────────────────────────
export async function main(playersCount: number, f?: (host: string, Server: Server) => void) {
    const maxPlayers = playersCount > 0 ? Math.min(playersCount, 6) : 6;

    interface Client {
        player: Player;
        socket: Socket;
        ready: boolean;
        positions: { x: number; y: number };
        connected?: boolean;
    }

    const Clients = new Map<string, Client>();
    const logs_strings: Array<string> = [];
    let currentId = "";
    let gameStarted = false;
    let selectedMode: MonopolyMode = MonopolyModes[0];

    function getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }

    function getPlayerColor(icon: number) {
        switch (icon) {
            case 0:
                return "#E0115F";
            case 1:
                return "#4169e1";
            case 2:
                return "#50C878";
            case 3:
                return "#FFC000";
            case 5:
                return "#FF7F50";
            case 4:
            default:
                return "#64748b";
        }
    }

    function emitServerHistory(actionText: string) {
        const historyObj: historyAction = {
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

    function EmitAll(event: string, args: any) {
        for (const x of Array.from(Clients.values())) x.socket.emit(event, args);
    }
    function EmitExcepts(id: string, event: string, args: any) {
        for (const [k, x] of Array.from(Clients.entries())) if (k !== id) x.socket.emit(event, args);
    }

    /** Broadcast canonical player state to every connected client. */
    function EmitStateUpdate() {
        EmitAll("state_update", { players: Array.from(Clients.values()).map((c) => c.player.to_json()) });
    }

    /**
     * Compute rent owed at a position (server-authoritative).
     * Returns { owner, amount }; amount=0 when mortgaged or unowned.
     */
    function computeRent(position: number, rolls: number, multiplier = 1): { owner: Player | null; amount: number } {
        const prop = propertyByPosition.get(position);
        if (!prop) return { owner: null, amount: 0 };

        for (const { player } of Array.from(Clients.values())) {
            for (const prp of player.properties) {
                if (prp.posistion !== position) continue;
                if (prp.morgage === true) return { owner: player, amount: 0 };

                let amt = 0;
                if (prop.group === "Utilities") {
                    const cnt = player.properties.filter((p: any) => p.group === "Utilities").length;
                    amt = rolls * (cnt === 2 ? 10 : 4) * multiplier;
                } else if (prop.group === "Railroad") {
                    const cnt = player.properties
                        .filter((p: any) => p.group === "Railroad" && p.morgage !== true).length;
                    amt = ([0, 25, 50, 100, 200][cnt] ?? 0) * multiplier;
                } else if (prp.count === 0) {
                    amt = (prop.rent ?? 0) * multiplier;
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

    /**
     * Process landing on a tile — mutates balances in place.
     * Returns: requiresPurchaseDecision (client should show buy/upgrade UI)
     *          landingNote (encoded event string for client notifications)
     */
    function processLanding(
        player: Player,
        position: number,
        rolls: number,
        multiplier = 1
    ): { requiresPurchaseDecision: boolean; landingNote: string } {
        const prop = propertyByPosition.get(position);
        if (!prop) return { requiresPurchaseDecision: false, landingNote: "" };
        if (INERT_TILES.has(prop.id ?? "")) return { requiresPurchaseDecision: false, landingNote: "" };
        if (CARD_TILES.has(prop.id ?? "")) return { requiresPurchaseDecision: false, landingNote: "" };
        if (prop.id === "gotojail") return { requiresPurchaseDecision: false, landingNote: "" }; // handled in roll_dice

        if (prop.id === "incometax") { player.balance -= 200; return { requiresPurchaseDecision: false, landingNote: "incometax:200" }; }
        if (prop.id === "luxerytax") { player.balance -= 100; return { requiresPurchaseDecision: false, landingNote: "luxerytax:100" }; }

        const { owner, amount } = computeRent(position, rolls, multiplier);
        if (owner !== null) {
            if (owner.id === player.id) return { requiresPurchaseDecision: true, landingNote: `own:${position}` };
            if (amount > 0) {
                player.balance -= amount;
                owner.balance += amount;
                return { requiresPurchaseDecision: false, landingNote: `rent:${owner.id}:${amount}` };
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
    function resolveCard(
        player: Player,
        card: any,
        rolls: number
    ): { requiresPurchaseDecision: boolean; newPosition?: number; extraRoll?: [number, number] } {
        switch (card.action) {
            case "addfunds":
                player.balance += card.amount ?? 0;
                return { requiresPurchaseDecision: false };

            case "removefunds":
                player.balance -= card.amount ?? 0;
                return { requiresPurchaseDecision: false };

            case "addfundsfromplayers": {
                for (const { player: p } of Array.from(Clients.values()).filter((c) => c.player.id !== player.id)) {
                    p.balance -= card.amount ?? 0;
                    player.balance += card.amount ?? 0;
                }
                return { requiresPurchaseDecision: false };
            }

            case "removefundstoplayers": {
                for (const { player: p } of Array.from(Clients.values()).filter((c) => c.player.id !== player.id)) {
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
                if (card.subaction === "getout") player.getoutCards += 1;
                return { requiresPurchaseDecision: false };

            case "move": {
                let targetPos: number | undefined;
                let passedGo = false;
                if (card.tileid) {
                    targetPos = propertyById.get(card.tileid)?.posistion;
                    if (targetPos !== undefined && targetPos < player.position) passedGo = true;
                } else if (card.count !== undefined) {
                    const raw = player.position + card.count;
                    targetPos = ((raw % 40) + 40) % 40;
                    if (card.count > 0 && raw >= 40) passedGo = true;
                }
                if (targetPos === undefined) return { requiresPurchaseDecision: false };
                if (passedGo) player.balance += 200;
                player.position = targetPos;
                const landing = processLanding(player, targetPos, rolls);
                return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: targetPos };
            }

            case "movenearest": {
                const group = card.groupid === "utility" ? "Utilities" : "Railroad";
                const positions = monopolyJSON.properties
                    .filter((p) => p.group === group)
                    .map((p) => p.posistion ?? 0)
                    .sort((a, b) => a - b);

                let nearest = positions[0];
                for (const pos of positions) { if (pos > player.position) { nearest = pos; break; } }
                if (nearest <= player.position) player.balance += 200; // wrapped past Go

                player.position = nearest;

                if (group === "Utilities") {
                    const d1 = Math.floor(Math.random() * 6) + 1;
                    const d2 = Math.floor(Math.random() * 6) + 1;
                    const landing = processLanding(player, nearest, d1 + d2, card.rentmultiplier ?? 1);
                    return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: nearest, extraRoll: [d1, d2] };
                }
                const landing = processLanding(player, nearest, rolls, card.rentmultiplier ?? 1);
                return { requiresPurchaseDecision: landing.requiresPurchaseDecision, newPosition: nearest };
            }

            case "propertycharges": {
                const houses = player.properties
                    .filter((p: any) => typeof p.count === "number" && p.count > 0)
                    .reduce((s: number, p: any) => s + (p.count as number), 0);
                const hotels = player.properties.filter((p: any) => p.count === "h").length;
                player.balance -= (card.buildings ?? 0) * houses + (card.hotels ?? 0) * hotels;
                return { requiresPurchaseDecision: false };
            }

            default:
                return { requiresPurchaseDecision: false };
        }
    }

    // ── WebSocket server ──────────────────────────────────────────────────────
    new Server(
        (server) => { f?.(server.code, server); },
        (socket: Socket, server: Server) => {
            let isReconnecting = Clients.has(socket.id);
            socket.emit("state", isReconnecting ? 0 : (Clients.size < maxPlayers && !gameStarted ? 0 : gameStarted ? 1 : 2));

            socket.on("name", (name: string) => {
                try {
                    let client = Clients.get(socket.id);
                    isReconnecting = client !== undefined;

                    if (!isReconnecting) {
                        const player = new Player(socket.id, name, Array.from(Clients.keys()).length, selectedMode.startingCash);
                        if (currentId === "" || !Array.from(Clients.keys()).includes(currentId)) currentId = socket.id;
                        client = { player, socket, ready: false, positions: { x: 0, y: 0 }, connected: true };
                        Clients.set(socket.id, client);
                    } else {
                        client!.socket = socket;
                        client!.connected = true;
                        client!.socket.emit("assign_id", socket.id);
                    }

                    const player = client!.player;
                    const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" has ${isReconnecting ? "reconnected" : "connected"}.`;
                    server.logFunction(logMsg);
                    logs_strings.push(logMsg);

                    socket.emit("initials", {
                        turn_id: currentId,
                        other_players: Array.from(Clients.values()).map((x) => x.player.to_json()),
                        selectedMode,
                        logs: logs_strings,
                    });

                    if (!isReconnecting) EmitExcepts(socket.id, "new-player", player.to_json());
                    else EmitExcepts(socket.id, "player_update", { playerId: player.id, pJson: player.to_json() });

                    // ── Unjail ────────────────────────────────────────────────
                    socket.on("unjail", (option: "card" | "pay") => {
                        try {
                            if (option === "pay") {
                                player.balance -= 50;
                                emitServerHistory(`${player.username} paid $50 to leave jail`);
                            } else if (option === "card" && player.getoutCards > 0) {
                                player.getoutCards -= 1;
                                emitServerHistory(`${player.username} used a Get Out of Jail Free card to leave jail`);
                            }
                            player.isInJail = false;
                            player.jailTurnsRemaining = 0;
                            EmitAll("unjail", { to: player.id, option });
                            EmitStateUpdate();
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Roll Dice ─────────────────────────────────────────────
                    socket.on("roll_dice", () => {
                        try {
                            if (currentId !== socket.id) return;
                            const d1 = Math.floor(Math.random() * 6) + 1;
                            const d2 = Math.floor(Math.random() * 6) + 1;
                            const sum = d1 + d2;
                            const logStr = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" rolled a [${d1},${d2}].`;
                            logs_strings.push(logStr);
                            server.logFunction(logStr);

                            // ── In Jail branch ──
                            if (player.isInJail) {
                                const doubles = d1 === d2;
                                if (!doubles) {
                                    player.jailTurnsRemaining = Math.max(0, player.jailTurnsRemaining - 1);
                                    emitServerHistory(`${player.username} failed doubles roll and stayed in Jail`);
                                    EmitAll("dice_roll_result", {
                                        listOfNums: [d1, d2, player.position],
                                        turnId: currentId,
                                        passedGo: false, goPayment: 0,
                                        goingToJail: false, jailStayed: true, jailEscape: false,
                                        rolledPosition: player.position, finalPosition: player.position,
                                        requiresPurchaseDecision: false, pendingCard: null, landingNote: "",
                                    });
                                    EmitStateUpdate();
                                    return;
                                }
                                // Doubles — escape jail, fall through to normal roll
                                player.isInJail = false;
                                player.jailTurnsRemaining = 0;
                                emitServerHistory(`${player.username} rolled doubles [${d1}, ${d2}] and escaped Jail!`);
                            }

                            // ── Normal roll ──
                            const oldPos = player.position;
                            const rolledPosition = (oldPos + sum) % 40;
                            const passedGo = (oldPos + sum) >= 40;
                            if (passedGo) {
                                player.balance += 200;
                                emitServerHistory(`${player.username} passed Go and collected $200`);
                            }

                            let finalPosition = rolledPosition;
                            let goingToJail = false;
                            let pendingCard: any = null;
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
                            } else {
                                player.position = rolledPosition;
                                const prop = propertyByPosition.get(rolledPosition);

                                if (prop && CARD_TILES.has(prop.id ?? "")) {
                                    const deck = prop.id === "chance" ? monopolyJSON.chance : (monopolyJSON as any).communitychest;
                                    const card = deck[Math.floor(Math.random() * deck.length)];
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
                                    };
                                    requiresPurchaseDecision = result.requiresPurchaseDecision;
                                    emitServerHistory(`${player.username} drew ${prop.id === "chance" ? "Chance" : "Community Chest"}: "${card.title}"`);
                                    
                                    // Check if card movement crossed GO
                                    if (player.balance >= balanceBeforeCard + 200 && (card.action === "move" || card.action === "movenearest")) {
                                        emitServerHistory(`${player.username} passed Go and collected $200`);
                                    }
                                } else {
                                    const landing = processLanding(player, rolledPosition, sum);
                                    requiresPurchaseDecision = landing.requiresPurchaseDecision;
                                    landingNote = landing.landingNote;

                                    if (landingNote.startsWith("incometax")) {
                                        emitServerHistory(`${player.username} paid $200 Income Tax`);
                                    } else if (landingNote.startsWith("luxerytax")) {
                                        emitServerHistory(`${player.username} paid $100 Luxury Tax`);
                                    } else if (landingNote.startsWith("rent:")) {
                                        const [, ownerId, rentAmt] = landingNote.split(":");
                                        const ownerName = Clients.get(ownerId)?.player.username ?? "someone";
                                        emitServerHistory(`${player.username} paid $${rentAmt} rent to ${ownerName}`);
                                    }
                                }
                            }

                            // If not going to jail, and didn't stay/escape jail, log standard roll
                            if (!goingToJail) {
                                const propName = propertyByPosition.get(rolledPosition)?.name ?? "";
                                emitServerHistory(`${player.username} rolled [${d1}, ${d2}] moving to "${propName}"`);
                            }

                            EmitAll("dice_roll_result", {
                                listOfNums: [d1, d2, rolledPosition],
                                turnId: currentId,
                                passedGo, goPayment: passedGo ? 200 : 0,
                                goingToJail, jailStayed: false, jailEscape: false,
                                rolledPosition, finalPosition,
                                requiresPurchaseDecision, pendingCard, landingNote,
                            });
                            EmitStateUpdate();
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Player Action (buy / upgrade / skip) ──────────────────
                    socket.on("player_action", (args: PlayerActionArgs) => {
                        try {
                            if (currentId !== socket.id) return;
                            const prop = propertyByPosition.get(player.position) as any;

                            if (args.action === "buy") {
                                if (!prop || prop.price === undefined) return;
                                player.balance -= prop.price;
                                player.properties.push({ posistion: player.position, count: 0, group: prop.group ?? "" });
                                logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${player.username}" bought ${prop.name ?? player.position}.`);
                                server.logFunction(`{${getCurrentTime()}} Player "${player.username}" bought ${prop.name ?? player.position}.`);
                                emitServerHistory(`${player.username} bought ${prop.name ?? "a property"}`);
                            } else if (args.action === "buy-advance") {
                                const idx = player.properties.findIndex((p: any) => p.posistion === player.position);
                                if (idx === -1) return;
                                if (args.newCount === 5) {
                                    player.balance -= prop?.ohousecost ?? 0;
                                    player.properties[idx].count = "h";
                                } else {
                                    player.balance -= (prop?.housecost ?? 0) * args.housesAdded;
                                    player.properties[idx].count = args.newCount;
                                }
                                emitServerHistory(`${player.username} upgraded ${prop.name}`);
                            }
                            // "skip" → no mutations
                            EmitStateUpdate();
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Mortgage Action ───────────────────────────────────────
                    socket.on("mortgage_action", (args: { action: "mortgage" | "unmortgage"; amount: number; propertyPosition: number }) => {
                        try {
                            // amount > 0: player pays (unmortgage); amount < 0: player receives (mortgage)
                            player.balance -= args.amount;
                            const idx = player.properties.findIndex((p: any) => p.posistion === args.propertyPosition);
                            if (idx !== -1) player.properties[idx].morgage = args.action === "mortgage";
                            EmitStateUpdate();
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Legacy chorch_roll — now handled inside roll_dice ─────
                    socket.on("chorch_roll", () => { /* no-op: server resolves cards in roll_dice */ });

                    // ── Finish Turn ───────────────────────────────────────────
                    socket.on("finish-turn", () => {
                        try {
                            if (currentId !== socket.id) return;
                            if (player.balance < 0) Clients.delete(socket.id);

                            const active = Array.from(Clients.values()).filter((v) => v.player.balance > 0);
                            const arr = active.map((v) => v.player.id);
                            let i = arr.indexOf(socket.id);
                            i = arr.length > 0 ? (i + 1) % arr.length : -1;
                            currentId = i === -1 ? "" : arr[i];

                            if (active.length <= 1) {
                                for (const c of Array.from(Clients.values())) c.ready = false;
                                gameStarted = false;
                                currentId = active[0]?.player.id ?? "";
                            }

                            EmitAll("turn-finished", {
                                from: socket.id,
                                turnId: currentId,
                                pJson: player.to_json(),
                                WinningMode: selectedMode.WinningMode,
                            });
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Message ───────────────────────────────────────────────
                    socket.on("message", (message: string) => {
                        try {
                            server.logFunction(`{${getCurrentTime()}} [${socket.id}] "${Clients.get(socket.id)?.player.username}" messaged "${message}".`);
                            EmitAll("message", { from: player.username, message });
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Pay (kept for backward-compat with trade system) ──────
                    socket.on("pay", (args: { balance: number; from: string; to: string }) => {
                        try {
                            const top = Clients.get(args.to)?.player;
                            const fromp = Clients.get(args.from)?.player;
                            if (!top || !fromp) return;
                            top.balance += args.balance;
                            fromp.balance -= args.balance;
                            EmitAll("member_updating", {
                                playerId: args.to,
                                animation: "recieveMoney",
                                additional_props: [args.from],
                                pJson: [top.to_json(), fromp.to_json()],
                            });
                        } catch (e) { server.logFunction(e); }
                    });

                    // ── Player Update (property-state sync / mortgage compat) ─
                    socket.on("player_update", (args: { playerId: string; pJson: PlayerJSON }) => {
                        const xc = Clients.get(args.playerId);
                        if (!xc) return;
                        if (args.playerId === socket.id) {
                            // Trust own updates (needed for mortgage UI compatibility)
                            xc.player.from_json(args.pJson);
                        } else {
                            xc.player.properties = args.pJson.properties;
                        }
                        EmitExcepts(args.playerId, "player_update", args);
                    });

                    // ── Mouse ─────────────────────────────────────────────────
                    socket.on("mouse", (args: { x: number; y: number }) => {
                        const c = Clients.get(socket.id);
                        if (!c) return;
                        c.positions = args;
                        EmitExcepts(socket.id, "mouse", { id: socket.id, x: args.x, y: args.y });
                    });

                    // ── History ───────────────────────────────────────────────
                    socket.on("history", (args: historyAction) => { EmitAll("history", args); });

                    // ── Trade ─────────────────────────────────────────────────
                    socket.on("trade", () => { if (!selectedMode.AllowDeals) return; EmitAll("trade", {}); });
                    socket.on("cancel-trade", () => { if (!selectedMode.AllowDeals) return; EmitAll("cancel-trade", {}); });
                    socket.on("trade-update", (x: GameTrading) => {
                        if (!selectedMode.AllowDeals) return;
                        if (x.turnPlayer.accepted && x.againstPlayer.accepted) {
                            const tp = Clients.get(x.turnPlayer.id);
                            const ap = Clients.get(x.againstPlayer.id);
                            if (!tp || !ap) return;

                            const tGets = ap.player.properties.filter((v1: any) =>
                                x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                            ap.player.properties = ap.player.properties.filter((v1: any) =>
                                !x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                            const aGets = tp.player.properties.filter((v1: any) =>
                                x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                            tp.player.properties = tp.player.properties.filter((v1: any) =>
                                !x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));

                            ap.player.balance -= x.againstPlayer.balance;
                            tp.player.balance -= x.turnPlayer.balance;
                            tp.player.balance += x.againstPlayer.balance;
                            ap.player.balance += x.turnPlayer.balance;
                            tp.player.properties.push(...tGets);
                            ap.player.properties.push(...aGets);

                            emitServerHistory(`${tp.player.username} done a trade with ${ap.player.username}`);
                            EmitAll("submit-trade", {
                                pJsons: [tp.player.to_json(), ap.player.to_json()],
                                action: `${tp.player.username} done a trade with ${ap.player.username}`,
                            });
                        } else {
                            EmitAll("trade-update", x);
                        }
                    });
                    socket.on("submit-trade", (x: GameTrading) => {
                        if (!selectedMode.AllowDeals) return;
                        if (!x.turnPlayer.accepted || !x.againstPlayer.accepted) return;
                        const tp = Clients.get(x.turnPlayer.id);
                        const ap = Clients.get(x.againstPlayer.id);
                        if (!tp || !ap) return;

                        const tGets = ap.player.properties.filter((v1: any) =>
                            x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                        ap.player.properties = ap.player.properties.filter((v1: any) =>
                            !x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                        const aGets = tp.player.properties.filter((v1: any) =>
                            x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                        tp.player.properties = tp.player.properties.filter((v1: any) =>
                            !x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));

                        ap.player.balance -= x.againstPlayer.balance;
                        tp.player.balance -= x.turnPlayer.balance;
                        tp.player.balance += x.againstPlayer.balance;
                        ap.player.balance += x.turnPlayer.balance;
                        tp.player.properties.push(...tGets);
                        ap.player.properties.push(...aGets);

                        emitServerHistory(`${tp.player.username} done a trade with ${ap.player.username}`);
                        EmitAll("submit-trade", {
                            pJsons: [tp.player.to_json(), ap.player.to_json()],
                            action: `${tp.player.username} done a trade with ${ap.player.username}`,
                        });
                    });

                    // ── Leave Room ────────────────────────────────────────────
                    socket.on("leave-room", () => {
                        const lc = Clients.get(socket.id);
                        if (!lc) return;
                        const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${lc.player.username}" has left the room.`;
                        server.logFunction(logMsg); logs_strings.push(logMsg);
                        Clients.delete(socket.id);
                        if (currentId === socket.id) {
                            const arr = Array.from(Clients.values()).filter((v) => v.player.balance > 0).map((v) => v.player.id);
                            currentId = arr.length > 0 ? arr[0] : "";
                        }
                        EmitAll("disconnected-player", { id: socket.id, turn: currentId, wasInGame: gameStarted });
                        if (Array.from(Clients.keys()).length === 0) { if (gameStarted) server.logFunction("Game has Ended."); gameStarted = false; }
                    });

                } catch (e) { server.logFunction(e); }
            });

            // ── Ready ─────────────────────────────────────────────────────────
            socket.on("ready", (args: { ready?: boolean; mode?: MonopolyMode }) => {
                try {
                    const client = Clients.get(socket.id);
                    if (!client) return;
                    if (args.ready !== undefined) client.ready = args.ready;
                    if (args.mode !== undefined) selectedMode = args.mode;
                    Clients.set(socket.id, client);
                    EmitAll("ready", { id: socket.id, state: client.ready, selectedMode });
                    const readys = Array.from(Clients.values()).map((v) => v.ready);
                    if (!readys.includes(false)) {
                        server.logFunction("Game has Started, No more Players can join the Server");
                        gameStarted = true;
                        EmitAll("start-game", {});
                    }
                } catch (e) { server.logFunction(e); }
            });

            // ── Disconnect ────────────────────────────────────────────────────
            socket.on("disconnect", () => {
                try {
                    let wasInGame = false;
                    if (Clients.has(socket.id)) {
                        const logMsg = `{${getCurrentTime()}} [${socket.id}] Player "${Clients.get(socket.id)?.player.username}" has disconnected.`;
                        server.logFunction(logMsg); logs_strings.push(logMsg);
                        wasInGame = gameStarted;
                    }
                    const dc = Clients.get(socket.id);
                    if (dc) { dc.ready = false; dc.connected = false; }
                    if (!wasInGame) {
                        Clients.delete(socket.id);
                        if (currentId === socket.id) {
                            const arr = Array.from(Clients.values()).filter((v) => v.player.balance > 0).map((v) => v.player.id);
                            if (arr.length > 0) {
                                let i = arr.indexOf(socket.id);
                                currentId = arr[i === -1 ? 0 : (i + 1) % arr.length];
                            } else currentId = "";
                        }
                    }
                    EmitAll("disconnected-player", { id: socket.id, turn: currentId, wasInGame });
                    if (Array.from(Clients.keys()).length === 0) {
                        if (gameStarted) server.logFunction("Game has Ended. Server is currently Open to new Players");
                        gameStarted = false;
                    }
                } catch (e) { server.logFunction(e); }
            });
        }
    );
}
