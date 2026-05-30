"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const sockets_1 = require("./sockets");
const monopoly_json_1 = __importDefault(require("./monopoly.json"));
const types_1 = require("./types");
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
        };
    }
    from_json(json) {
        if (this.id == json.id) {
            this.position = json.position;
            this.balance = json.balance;
            this.properties = json.properties;
            this.isInJail = json.isInJail;
            this.jailTurnsRemaining = json.jailTurnsRemaining;
            this.getoutCards = json.getoutCards;
        }
    }
}
async function main(playersCount, f) {
    const maxPlayers = playersCount > 0 ? Math.min(playersCount, 6) : 6;
    const Clients = new Map();
    const logs_strings = [];
    //#region Game Variables!
    let currentId = "";
    let gameStarted = false;
    let selectedMode = types_1.MonopolyModes[0];
    //#endregion
    // Io
    function getCurrentTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const currentTime = `${hours}:${minutes}`;
        return currentTime;
    }
    //#region emits functions
    function EmitAll(event, args) {
        for (const x of Array.from(Clients.values())) {
            x.socket.emit(event, args);
        }
    }
    function EmitExcepts(id, event, args) {
        for (const x of Array.from(Clients.entries())) {
            if (x[0] != id) {
                x[1].socket.emit(event, args);
            }
        }
    }
    //#endregion
    //#endregion
    //#region Game Logic
    new sockets_1.Server((server) => {
        f?.(server.code, server);
    }, (socket, server) => {
        // Handle name event
        let isReconnecting = Clients.has(socket.id);
        console.log("state", Clients.size < maxPlayers && !gameStarted ? 0 : (gameStarted && !isReconnecting) ? 1 : 2);
        socket.emit("state", isReconnecting ? 0 : (Clients.size < maxPlayers && !gameStarted ? 0 : gameStarted ? 1 : 2));
        socket.on("name", (name) => {
            try {
                let client = Clients.get(socket.id);
                isReconnecting = client !== undefined;
                if (!isReconnecting) {
                    const player = new Player(socket.id, name, Array.from(Clients.keys()).length, selectedMode.startingCash);
                    if (currentId === "" || !Array.from(Clients.keys()).includes(currentId)) {
                        currentId = socket.id;
                    }
                    client = {
                        player: player,
                        socket: socket,
                        ready: false,
                        positions: { x: 0, y: 0 },
                        connected: true,
                    };
                    Clients.set(socket.id, client);
                }
                else {
                    // RECONNECTING
                    client.socket = socket;
                    client.connected = true;
                    client.socket.emit("assign_id", socket.id);
                }
                const player = client.player;
                server.logFunction(`{${getCurrentTime()}} [${socket.id}] Player "${player.username}" has ${isReconnecting ? 'reconnected' : 'connected'}.`);
                logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${player.username}" has ${isReconnecting ? 'reconnected' : 'connected'}.`);
                const other_players = [];
                for (const x of Array.from(Clients.values())) {
                    other_players.push(x.player.to_json());
                }
                socket.emit("initials", {
                    turn_id: currentId,
                    other_players,
                    selectedMode,
                    logs: logs_strings,
                });
                if (!isReconnecting) {
                    EmitExcepts(socket.id, "new-player", player.to_json());
                }
                else {
                    EmitExcepts(socket.id, "player_update", { playerId: player.id, pJson: player.to_json() });
                }
                // handle all events from here on!
                // game sockets
                socket.on("unjail", (option) => {
                    try {
                        EmitAll("unjail", {
                            to: player.id,
                            option,
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                socket.on("roll_dice", () => {
                    try {
                        const first = Math.floor(Math.random() * 6) + 1;
                        const second = Math.floor(Math.random() * 6) + 1;
                        const x = `{${getCurrentTime()}} [${socket.id}] Player "${player.username}" rolled a [${first},${second}].`;
                        logs_strings.push(x);
                        server.logFunction(x);
                        const sum = first + second;
                        var pos = (player.position + sum) % 40;
                        EmitAll("dice_roll_result", {
                            listOfNums: [first, second, pos],
                            turnId: currentId,
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                // chest or chance
                socket.on("chorch_roll", (args) => {
                    try {
                        const arr = args.is_chance ? monopoly_json_1.default.chance : monopoly_json_1.default.communitychest;
                        const randomElement = arr[Math.floor(Math.random() * arr.length)];
                        EmitAll("chorch_result", {
                            element: randomElement,
                            is_chance: args.is_chance,
                            rolls: args.rolls,
                            turnId: currentId,
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                socket.on("player_update", (args) => {
                    const xplayer = Clients.get(args.playerId);
                    if (xplayer === undefined)
                        return;
                    xplayer.player.from_json(args.pJson);
                    EmitExcepts(args.playerId, "player_update", args);
                });
                socket.on("finish-turn", (playerInfo) => {
                    try {
                        player.from_json(playerInfo);
                        if (currentId != socket.id)
                            return;
                        const arr = Array.from(Clients.values())
                            .filter((v) => v.player.balance > 0)
                            .map((v) => v.player.id);
                        var i = arr.indexOf(socket.id);
                        i = (i + 1) % arr.length;
                        currentId = arr[i];
                        EmitAll("turn-finished", {
                            from: socket.id,
                            turnId: currentId,
                            pJson: player.to_json(),
                            WinningMode: selectedMode.WinningMode,
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                socket.on("message", (message) => {
                    try {
                        server.logFunction(`{${getCurrentTime()}} [${socket.id}] Player "${Clients.get(socket.id)?.player.username}" has messaged "${message}".`);
                        EmitAll("message", {
                            from: player.username,
                            message: message,
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                socket.on("pay", (args) => {
                    try {
                        const top = Clients.get(args.to)?.player;
                        const fromp = Clients.get(args.from)?.player;
                        if (top === undefined)
                            return;
                        top.balance += args.balance;
                        if (fromp === undefined)
                            return;
                        fromp.balance -= args.balance;
                        EmitAll("member_updating", {
                            playerId: args.to,
                            animation: "recieveMoney",
                            additional_props: [args.from],
                            pJson: [top.to_json(), fromp.to_json()],
                        });
                    }
                    catch (e) {
                        server.logFunction(e);
                    }
                });
                socket.on("mouse", (args) => {
                    const client = Clients.get(socket.id);
                    if (client === undefined)
                        return;
                    client.positions = args;
                    Clients.set(socket.id, client);
                    EmitExcepts(socket.id, "mouse", {
                        id: socket.id,
                        x: args.x,
                        y: args.y,
                    });
                });
                socket.on("history", (args) => {
                    EmitAll("history", args);
                });
                socket.on("trade", () => {
                    if (!selectedMode.AllowDeals)
                        return;
                    EmitAll("trade", {});
                });
                socket.on("cancel-trade", () => {
                    if (!selectedMode.AllowDeals)
                        return;
                    EmitAll("cancel-trade", {});
                });
                socket.on("submit-trade", (x) => {
                    if (!selectedMode.AllowDeals)
                        return;
                    const turnPlayer = Clients.get(x.turnPlayer.id);
                    const againstPlayer = Clients.get(x.againstPlayer.id);
                    if (turnPlayer === undefined || againstPlayer === undefined)
                        return;
                    // Exclude against
                    const turnGets = againstPlayer.player.properties.filter((v1) => x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                    againstPlayer.player.properties = againstPlayer.player.properties.filter((v1) => !x.againstPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                    // Exclude turn
                    const againsGets = turnPlayer.player.properties.filter((v1) => x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                    turnPlayer.player.properties = turnPlayer.player.properties.filter((v1) => !x.turnPlayer.prop.map((v2) => JSON.stringify(v2)).includes(JSON.stringify(v1)));
                    // Now Balance
                    againstPlayer.player.balance -= x.againstPlayer.balance;
                    turnPlayer.player.balance -= x.turnPlayer.balance;
                    turnPlayer.player.balance += x.againstPlayer.balance;
                    againstPlayer.player.balance += x.turnPlayer.balance;
                    // Exclude switch
                    turnPlayer.player.properties.push(...turnGets);
                    againstPlayer.player.properties.push(...againsGets);
                    EmitAll("submit-trade", {
                        pJsons: [turnPlayer.player.to_json(), againstPlayer.player.to_json()],
                        action: `
                            ${turnPlayer.player.username} done a trade with ${againstPlayer.player.username}
                            `,
                    });
                });
                socket.on("trade-update", (x) => {
                    if (!selectedMode.AllowDeals)
                        return;
                    EmitAll("trade-update", x);
                });
                socket.on("leave-room", () => {
                    const leavingClient = Clients.get(socket.id);
                    if (leavingClient === undefined)
                        return;
                    server.logFunction(`{${getCurrentTime()}} [${socket.id}] Player "${leavingClient.player.username}" has left the room.`);
                    logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${leavingClient.player.username}" has left the room.`);
                    Clients.delete(socket.id);
                    if (currentId === socket.id) {
                        const arr = Array.from(Clients.values())
                            .filter((v) => v.player.balance > 0)
                            .map((v) => v.player.id);
                        if (arr.length > 0) {
                            currentId = arr[0];
                        }
                        else {
                            currentId = "";
                        }
                    }
                    EmitAll("disconnected-player", {
                        id: socket.id,
                        turn: currentId,
                        wasInGame: gameStarted,
                    });
                    if (Array.from(Clients.keys()).length === 0) {
                        if (gameStarted)
                            server.logFunction("Game has Ended. Server is currently Open to new Players");
                        gameStarted = false;
                    }
                });
            }
            catch (e) {
                server.logFunction(e);
            }
        });
        socket.on("ready", (args) => {
            try {
                const client = Clients.get(socket.id);
                if (client === undefined)
                    return;
                if (args.ready !== undefined) {
                    client.ready = args.ready;
                }
                if (args.mode !== undefined) {
                    selectedMode = args.mode;
                }
                Clients.set(socket.id, client);
                // Check if everyone Ready!
                const readys = Array.from(Clients.values()).map((v) => v.ready);
                EmitAll("ready", {
                    id: socket.id,
                    state: client.ready,
                    selectedMode,
                });
                if (!readys.includes(false)) {
                    server.logFunction(`Game has Started, No more Players can join the Server`);
                    gameStarted = true;
                    EmitAll("start-game", {});
                }
            }
            catch (e) {
                server.logFunction(e);
            }
        });
        // Handle disconnect event
        socket.on("disconnect", () => {
            try {
                let wasInGame = false;
                if (Clients.has(socket.id)) {
                    server.logFunction(`{${getCurrentTime()}} [${socket.id}] Player "${Clients.get(socket.id)?.player.username}" has disconnected.`);
                    logs_strings.push(`{${getCurrentTime()}} [${socket.id}] Player "${Clients.get(socket.id)?.player.username}" has disconnected.`);
                    wasInGame = gameStarted;
                }
                const disconnectedClient = Clients.get(socket.id);
                if (disconnectedClient !== undefined) {
                    disconnectedClient.ready = false;
                    disconnectedClient.connected = false;
                }
                if (!wasInGame) {
                    Clients.delete(socket.id);
                    if (currentId === socket.id) {
                        const arr = Array.from(Clients.values())
                            .filter((v) => v.player.balance > 0)
                            .map((v) => v.player.id);
                        if (arr.length > 0) {
                            var i = arr.indexOf(socket.id);
                            i = i === -1 ? 0 : (i + 1) % arr.length;
                            currentId = arr[i];
                        }
                        else {
                            currentId = "";
                        }
                    }
                }
                else {
                    // Mark as disconnected but KEEP in Clients so they can reconnect
                }
                EmitAll("disconnected-player", {
                    id: socket.id,
                    turn: currentId,
                    wasInGame: wasInGame
                });
                if (Array.from(Clients.keys()).length === 0) {
                    if (gameStarted)
                        server.logFunction("Game has Ended. Server is currently Open to new Players");
                    gameStarted = false;
                }
            }
            catch (e) {
                server.logFunction(e);
            }
        });
    });
}
exports.main = main;
