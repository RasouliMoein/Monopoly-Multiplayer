import { useState, useEffect, useRef } from "react";
import { Server, Socket } from "../../assets/sockets.ts";
import { Player, PlayerJSON } from "../../assets/player.ts";
import "../../monopoly.css";
import MonopolyNav, { MonopolyNavRef } from "../../components/ingame/nav.tsx";
import MonopolyGame, { MonopolyGameRef } from "../../components/ingame/game.tsx";
import NotifyElement, { NotificatorRef } from "../../components/notificator.tsx";
import monopolyJSON from "../../assets/monopoly.json";
import { MonopolySettings, MonopolyModes, historyAction, history, GameTrading, MonopolyMode, MonopolyCookie } from "../../assets/types.ts";
import { CookieManager } from "../../assets/cookieManager.ts";
function App({ socket, name, server }: { socket: Socket; name: string; server: Server | undefined }) {
    const [clients, SetClients] = useState<Map<string, Player>>(new Map());
    const players = Array.from(clients.values());
    const clientsRef = useRef(clients);
    clientsRef.current = clients;

    const leaveGameSession = () => {
        sessionStorage.removeItem("current_room");
        sessionStorage.removeItem("current_name");
        document.location.reload();
    };

    const getBalancesSnapshot = () => {
        return Array.from(clientsRef.current.values()).map((p) => ({
            username: p.username,
            balance: p.balance,
            color: p.color,
        }));
    };

    const emitHistory = (actionText: string) => {
        socket.emit("history", history(actionText, getBalancesSnapshot()));
    };

    const [currentId, SetCurrent] = useState<string>("");
    const [gameStarted, SetGameStarted] = useState<boolean>(false);
    const [gameStartedDisplay, SetGameStartedDisplay] = useState<boolean>(false);
    const [imReady, SetReady] = useState<boolean>(false);
    const [selectedMode, SetMode] = useState<MonopolyMode>(MonopolyModes[0]);
    const [hostId, SetHostId] = useState<string>("");
    const [reconnectAttempt, SetReconnectAttempt] = useState<number | null>(null);
    const [copiedCode, setCopiedCode] = useState<boolean>(false);
    const [globalSettings, SetSettings] = useState<MonopolySettings>(() => {
        try {
            const cookieStr = CookieManager.get("monopolySettings");
            if (cookieStr) {
                const cookie = JSON.parse(decodeURIComponent(cookieStr)) as MonopolyCookie;
                if (cookie.settings) {
                    return cookie.settings;
                }
            }
        } catch (e) {
            console.error(e);
        }
        return {
            gameEngine: "2d",
            accessibility: [45, 5, false, false, true],
            audio: [100, 100, 5],
            notifications: true
        };
    });
    const [mainTheme, SetTheme] = useState(new Audio("./main-theme.mp3"));
    const [startTIme, SetStartTime] = useState<Date>(new Date());
    const [histories, SetHistories] = useState<Array<historyAction>>([]);

    const [currentTrade, setTrade] = useState<GameTrading | boolean | undefined>(undefined);
    const leavingRoomRef = useRef<boolean>(false);

    useEffect(() => {
        if (!gameStartedDisplay) return;
        // Sound Effect
        mainTheme.loop = true;
        mainTheme.play();

        mainTheme.volume = 0.25;
        if (globalSettings !== undefined) {
            mainTheme.volume = (globalSettings.audio[0] / 100) * (globalSettings.audio[2] / 100);
        }
        SetTheme(mainTheme);
        SetStartTime(new Date());
    }, [gameStartedDisplay]);

    useEffect(() => {
        const settings_interval = setInterval(() => {
            try {
                const cookieStr = CookieManager.get("monopolySettings");
                if (cookieStr) {
                    const parsedCookie = JSON.parse(decodeURIComponent(cookieStr)).settings;
                    if (parsedCookie) {
                        SetSettings(parsedCookie);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }, 1000);
        return () => {
            clearInterval(settings_interval);
        };
    }, []);

    useEffect(() => {
        if (globalSettings !== undefined) {
            mainTheme.volume = (globalSettings.audio[0] / 100) * (globalSettings.audio[2] / 100);
        }
    }, [globalSettings]);

    const engineRef = useRef<MonopolyGameRef>(null);
    const navRef = useRef<MonopolyNavRef>(null);
    const notifyRef = useRef<NotificatorRef>(null);
    const animatingPlayersRef = useRef<Set<string>>(new Set());

    const propretyMap = new Map(
        monopolyJSON.properties.map((obj) => {
            return [obj.posistion ?? 0, obj];
        })
    );
    if (server !== undefined) {
        server.RenderLogs((array) => {
            try {
                const x = document.body.querySelector("#server main div.middle") as HTMLDivElement;
                x.innerHTML = "";
                for (const v of array) {
                    x.innerHTML += `<p> ${v.join("\t")} </p>`;
                }
            } catch {}
        });
    }
    useEffect(() => {
        let settings: MonopolySettings | undefined = undefined;

        const settings_interval = setInterval(() => {
            try {
                const cookieStr = CookieManager.get("monopolySettings");
                if (cookieStr) {
                    const parsedCookie = JSON.parse(decodeURIComponent(cookieStr)).settings;
                    if (parsedCookie) {
                        settings = parsedCookie;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }, 1000);

        function mouseMove(e: MouseEvent) {
            const _pos = { x: e.clientX, y: e.clientY };
            const xplayer = clients.get(socket.id);
            socket.emit("mouse", _pos);
            xplayer ? (xplayer.positions = _pos) : "";
        }

        function destroyPlayer(playerId: string) {
            // remove player from clients
            function removePlayer() {
                clients.delete(playerId);
                SetClients(new Map(clients));

                // 1 frame to check if it isnt removed
                requestAnimationFrame(() => {
                    if (clients.has(playerId)) {
                        // request a loop frame!
                        requestAnimationFrame(removePlayer);
                    } else {
                    }
                });
            }
            removePlayer();

            // removing child from game div
            function removeChild() {
                const _element = document.querySelector(`div.player[player-id="${playerId}"]`);
                if (_element === null) return;
                if (_element.parentElement) _element.parentElement.removeChild(_element);
                _element.remove();

                // 1 frame to check if it isnt removed
                requestAnimationFrame(() => {
                    if (document.querySelector(`div.player[player-id="${playerId}"]`) !== null) {
                        // request a loop frame!
                        requestAnimationFrame(removeChild);
                    } else {
                    }
                });
            }
            removeChild();
        }

        function playerMoveGENERATOR(
            final_position: number,
            _xplayer: Player,
            get200whengo: boolean = true,
            afterFinished?: () => void,
            adding: boolean = true
        ) {
            animatingPlayersRef.current.add(_xplayer.id);
            var sum_moves = (final_position - _xplayer.position) % 40;
            if ((final_position < _xplayer.position || sum_moves < 0) && adding) {
                sum_moves = 40 - _xplayer.position + final_position;
            }

            if (!adding) {
                sum_moves = _xplayer.position - final_position;
                if (sum_moves < 0) {
                    sum_moves += 40;
                }
            }

            const time = 0.35 * 1000 * sum_moves;

            console.log(`${new Date().toTimeString()} generator ${Math.random()} target ${final_position} time ${time} current ${_xplayer.position}`);
            function _playerMoveFunc() {
                var firstPosition = 0;
                var addedMoney = false;
                var i = 0;
                const element = document.querySelector(`div.player[player-id="${_xplayer.id}"]`) as HTMLDivElement;

                firstPosition = _xplayer.position;
                _xplayer.position += 1;
                var audio = new Audio("./step2.mp3");
                audio.volume = 0.1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                audio.loop = false;
                audio.play();
                element.style.animation = "jumpstreet 0.35s cubic-bezier(.26,1.5,.65,1.02)";
                const movingAnim = () => {
                    if (i < sum_moves) {
                        i += 1;
                        var audio = new Audio("./step2.mp3");
                        audio.volume = 1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        audio.loop = false;
                        audio.play();
                        _xplayer.position = (_xplayer.position + (adding ? 1 : -1)) % 40;
                        if (_xplayer.position == 0 && get200whengo) {
                            // Go payment is handled server-side — just play audio/animation
                            var audio = new Audio("./moneyplus.mp3");
                            audio.volume = 1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            audio.loop = false;
                            audio.play();
                            addedMoney = true;
                            SetClients(new Map(clients.set(_xplayer.id, _xplayer)));
                        }
                        if (i == sum_moves - 1) {
                            _xplayer.position = final_position;
                            element.style.animation = "part 0.9s cubic-bezier(0,.7,.57,1)";
                            setTimeout(() => {
                                element.style.animation = "";
                            }, 900);

                            if (!addedMoney && firstPosition > _xplayer.position && get200whengo) {
                                // Go payment is handled server-side — just play audio
                                var audio = new Audio("./moneyplus.mp3");
                                audio.volume = 1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                                audio.loop = false;
                                audio.play();
                                addedMoney = true;
                                SetClients(new Map(clients.set(_xplayer.id, _xplayer)));
                            }
                            animatingPlayersRef.current.delete(_xplayer.id);
                            if (afterFinished) afterFinished();
                        } else {
                            element.style.animation = "jumpstreet 0.35s cubic-bezier(.26,1.5,.65,1.02)";
                            setTimeout(movingAnim, 0.35 * 1000);
                        }
                    }
                };
                setTimeout(movingAnim, 0.35 * 1000);
            }

            return {
                func: _playerMoveFunc,
                time,
            };
        }

        //#region socket handeling
        const socket_Initials = (args: { turn_id: string; other_players: Array<PlayerJSON>; selectedMode: MonopolyMode; gameStarted?: boolean; hostId?: string }) => {
            SetCurrent(args.turn_id.toString());
            for (const x of args.other_players) {
                SetClients(clients.set(x.id, new Player(x.id, x.username).recieveJson(x)));
            }
            SetMode(args.selectedMode);
            if (args.gameStarted) {
                SetGameStarted(true);
                SetGameStartedDisplay(true);
            }
            if (args.hostId) {
                SetHostId(args.hostId);
            }
        };

        const socket_NewPlayer = (args: PlayerJSON) => {
            SetClients(new Map(clients.set(args.id, new Player(args.id, args.username).recieveJson(args))));
        };

        const socket_Ready = (args: { id: string; state: boolean; selectedMode: MonopolyMode }) => {
            const x = clients.get(args.id);
            if (x === undefined) return;
            x.ready = args.state;
            SetClients(new Map(clients.set(x.id, x)));
            SetMode(args.selectedMode);
        };
        const socket_StartGame = () => {
            SetGameStarted(true);
            function A(n: number) {
                const p = document.querySelector("p#floating-clock") as HTMLParagraphElement;
                p.innerHTML = `${n}`;
                p.className = "clocking";
            }
            A(3);
            setTimeout(() => {
                A(2);
                setTimeout(() => {
                    A(1);
                    setTimeout(() => {
                        SetGameStartedDisplay(true);
                    }, 1000);
                }, 1000);
            }, 1000);
        };

        const socket_DisconnectedPlayer = (args: { id: string; turn: string; wasInGame?: boolean }) => {
            SetCurrent(args.turn);
            const name = clients.get(args.id)?.username ?? "player";
            if (args.wasInGame) {
                notifyRef.current?.message(`${name} disconnected temporarily... waiting to reconnect!`, "info");
                return; // Do not destroy the player!
            }
            if (clients.size > 2) {
                notifyRef.current?.message(`${name} disconnected`, "error");
            } else if (clients.has(args.id)) {
                mainTheme.pause();
                notifyRef.current?.dialog(
                    (close_func, createButton) => ({
                        innerHTML: `<h3> YOU WON! </h3> <p> your the only left player with the balance of ${
                            clients.get(socket.id)?.balance ?? 0
                        } </p>`,
                        buttons: [
                            createButton("LEAVE GAME", () => {
                                close_func();
                                leaveGameSession();
                            }),
                        ],
                    }),
                    "winning"
                );
            }
            destroyPlayer(args.id);
        };

        const socket_TurnFinished = (args: { from: string; turnId: string; pJson: PlayerJSON; WinningMode: string }) => {
            const x = clients.get(args.from);

            if (x !== undefined && JSON.stringify(x.properties) != JSON.stringify(args.pJson.properties)) {
                // sound part - other player part
                var audio = new Audio("./buying1.mp3");
                audio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                audio.loop = false;
                audio.play();
            }

            if (args.from !== socket.id && x) {
                x.recieveJson(args.pJson);
                SetClients(new Map(clients.set(args.from, x)));
            }

            if (args.pJson.balance < 0) {
                if (args.pJson.id !== socket.id) {
                    if (clients.size > 2) {
                        const name = args.pJson.username;
                        notifyRef.current?.message(`${name} lost`, "info");
                    } else {
                        if (clients.has(socket.id)) {
                            mainTheme.pause();
                            notifyRef.current?.dialog(
                                (close_func, createButton) => ({
                                    innerHTML: `<h3> YOU WON! </h3> <p> your the only left player with the balance of ${
                                        clients.get(socket.id)?.balance ?? 0
                                    } </p>`,
                                    buttons: [
                                        createButton("LEAVE GAME", () => {
                                            close_func();
                                            leaveGameSession();
                                        }),
                                    ],
                                }),
                                "winning"
                            );
                        } else {
                            const xclient = Array.from(clients.values()).filter((v) => v.id !== args.pJson.id)[0];
                            const name = xclient.username ?? 0;
                            mainTheme.pause();
                            notifyRef.current?.dialog(
                                (close_func, createButton) => ({
                                    innerHTML: `<h3> ${name} WON! </h3> <p> ${name} won with the balance of ${
                                        clients.get(socket.id)?.balance ?? 0
                                    } </p>`,
                                    buttons: [
                                        createButton("LEAVE GAME", () => {
                                            close_func();
                                            leaveGameSession();
                                        }),
                                    ],
                                }),
                                "winning"
                            );
                        }
                    }
                } else {
                    mainTheme.pause();
                    notifyRef.current?.dialog(
                        (close_func, createButton) => ({
                            innerHTML: `<h3> YOU LOST! </h3> <p> you lost your money and lost the monopol with a wanted balance of ${-(
                                clients.get(socket.id)?.balance ?? 0
                            )} </p>`,
                            buttons: [
                                createButton("CONTINUE WATCHING", () => {
                                    close_func();
                                }),
                                createButton("LEAVE GAME", () => {
                                    close_func();
                                    leaveGameSession();
                                }),
                            ],
                        }),
                        "loosing"
                    );
                }

                destroyPlayer(args.pJson.id);
            }
            if (args.WinningMode === "monopols" || args.WinningMode === "monopols & trains") {
                function removeDuplicates(originalList: Array<any>) {
                    // Create an empty array to store unique values
                    const uniqueList: Array<any> = [];

                    // Use the filter method to iterate through the original list
                    originalList.filter(function (item) {
                        // If the item is not already in the uniqueList, add it
                        if (!uniqueList.includes(item)) {
                            uniqueList.push(item);
                        }
                        // Always return false in the filter function to skip duplicates
                        return false;
                    });

                    // Return the uniqueList
                    return uniqueList;
                }
                for (const p of Array.from(clients.values())) {
                    const prpGrups = [];
                    for (const prp of p.properties) {
                        if (!["Special", "Railroad", "Utilities"].includes(prp.group)) prpGrups.push(prp.group);
                    }
                    let x: number = 0;

                    for (const g of removeDuplicates(prpGrups)) {
                        const c = prpGrups.filter((v) => v === g).length;
                        const cc = monopolyJSON.properties.filter((v) => v.group === g).length;
                        if (c === cc) {
                            x += 1;
                        }
                    }
                    if (x === 3) {
                        mainTheme.pause();
                        if (p.id === socket.id) {
                            notifyRef.current?.dialog(
                                (close_func, createButton) => ({
                                    innerHTML: `<h3> YOU WON! </h3> <p> you have 3 sets! </p>`,
                                    buttons: [
                                        createButton("LEAVE GAME", () => {
                                            close_func();
                                            leaveGameSession();
                                        }),
                                    ],
                                }),
                                "winning"
                            );
                        } else {
                            notifyRef.current?.dialog(
                                (close_func, createButton) => ({
                                    innerHTML: `<h3> ${p.username} WON! </h3> <p> got 3 sets! </p>`,
                                    buttons: [
                                        createButton("LEAVE GAME", () => {
                                            close_func();
                                            leaveGameSession();
                                        }),
                                    ],
                                }),
                                "winning"
                            );
                        }
                        return;
                    }
                }
                if (args.WinningMode === "monopols & trains") {
                    // continue with trains winning state!
                    for (const p of Array.from(clients.values())) {
                        const c = p.properties.filter((v) => v.group === "Railroad").length;
                        if (c === 4) {
                            mainTheme.pause();
                            if (p.id === socket.id) {
                                notifyRef.current?.dialog(
                                    (close_func, createButton) => ({
                                        innerHTML: `<h3> YOU WON! </h3> <p> you have 4 railroads! </p>`,
                                        buttons: [
                                            createButton("LEAVE GAME", () => {
                                                close_func();
                                                leaveGameSession();
                                            }),
                                        ],
                                    }),
                                    "winning"
                                );
                            } else {
                                notifyRef.current?.dialog(
                                    (close_func, createButton) => ({
                                        innerHTML: `<h3> ${p.username} WON! </h3> <p> got 4 railroads! </p>`,
                                        buttons: [
                                            createButton("LEAVE GAME", () => {
                                                close_func();
                                                leaveGameSession();
                                            }),
                                        ],
                                    }),
                                    "winning"
                                );
                            }
                            return;
                        }
                    }
                }
            }

            SetCurrent(args.turnId);
            if (args.turnId === socket.id) {
                const x = clients.get(args.turnId);
                if (x && x.isInJail) {
                    engineRef.current?.showJailsButtons((x?.getoutCards ?? -1) > 0);
                } else {
                }
            }
            navRef.current?.reRenderPlayerList();
        };

        const socket_Message = (message: { from: string; message: string }) => {
            navRef.current?.addMessage(message);
        };
        const socket_DiceRollResult = (args: {
            listOfNums: [number, number, number];
            turnId: string;
            passedGo?: boolean;
            goPayment?: number;
            goingToJail?: boolean;
            jailStayed?: boolean;
            rolledPosition?: number;
            finalPosition?: number;
            requiresPurchaseDecision?: boolean;
            pendingCard?: any;
            landingNote?: string;
        }) => {
            const xplayer = clients.get(args.turnId) as Player;
            const wasInJail = xplayer?.isInJail;
            var audio = new Audio("./rolling.mp3");
            audio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
            audio.loop = false;
            audio.play();

            const isActivePlayer = args.turnId === socket.id;
            const rolls = args.listOfNums[0] + args.listOfNums[1];
            const rolledPosition = args.listOfNums[2]; // position before jail correction

            // ── Go notification (balance already applied server-side) ──
            if (args.passedGo) {
                var goAudio = new Audio("./moneyplus.mp3");
                goAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                goAudio.loop = false;
                goAudio.play();
                if (isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`$200 added for passing Go!`, "info", 2, () => {}, false);
                    engineRef.current?.applyAnimation(2);
                }
            }

            // ── Landing notifications (taxes / rent — applied server-side) ──
            if (args.landingNote && isActivePlayer) {
                const note = args.landingNote;
                if (note.startsWith("incometax")) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`Paid $200 income tax`, "info", 2, () => {}, false);
                    var taxAudio = new Audio("./moneyminus.mp3");
                    taxAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    taxAudio.play();
                    engineRef.current?.applyAnimation(1);
                } else if (note.startsWith("luxerytax")) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`Paid $100 luxury tax`, "info", 2, () => {}, false);
                    var taxAudio2 = new Audio("./moneyminus.mp3");
                    taxAudio2.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    taxAudio2.play();
                    engineRef.current?.applyAnimation(1);
                } else if (note.startsWith("rent:")) {
                    const [, ownerId, rentAmt] = note.split(":");
                    const ownerName = clients.get(ownerId)?.username ?? "someone";
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`Paid $${rentAmt} rent to ${ownerName}`, "info", 2, () => {}, false);
                    var rentAudio = new Audio("./moneyminus.mp3");
                    rentAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    rentAudio.play();
                    engineRef.current?.applyAnimation(1);
                }
            }
            // Notify owner on rent received
            if (args.landingNote?.startsWith("rent:")) {
                const ownerId = args.landingNote.split(":")[1];
                const rentAmt = args.landingNote.split(":")[2];
                if (ownerId === socket.id && !isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`Received $${rentAmt} rent`, "info", 2, () => {}, false);
                    var rentRecAudio = new Audio("./moneyplus.mp3");
                    rentRecAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    rentRecAudio.play();
                    engineRef.current?.applyAnimation(2);
                }
            }

            // ── Helper: show property buy/upgrade UI and emit player_action ──
            const showBuyUI = (location: number) => {
                const proprety = propretyMap.get(location);
                if (!proprety) { engineRef.current?.freeDice(); socket.emit("finish-turn"); return; }
                engineRef.current?.setStreet({
                    location,
                    rolls,
                    onResponse: (b: string, info: any) => {
                        let time_till_free = 0;
                        if (b === "buy" || b === "special_action") {
                            socket.emit("player_action", { action: "buy" });
                            if (settings?.notifications === true)
                                notifyRef.current?.message(
                                    `${clients.get(socket.id)?.username ?? "you"} bought ${proprety?.name ?? "a property"} for $${proprety?.price ?? 0}`,
                                    "info", 2, () => {}, false
                                );
                            var buyAudio = new Audio("./buying1.mp3");
                            buyAudio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            buyAudio.play();
                            engineRef.current?.applyAnimation(1);
                        } else if (b === "advance-buy") {
                            const _info = info as { state: 1 | 2 | 3 | 4 | 5; money: number };
                            socket.emit("player_action", { action: "buy-advance", newCount: _info.state, housesAdded: _info.money });
                            if (_info.state === 5) {
                                if (settings?.notifications === true)
                                    notifyRef.current?.message(`Built a hotel on ${proprety?.name}`, "info", 2, () => {}, false);
                            } else {
                                if (settings?.notifications === true)
                                    notifyRef.current?.message(`Built ${_info.money} house${_info.money > 1 ? "s" : ""} on ${proprety?.name}`, "info", 2, () => {}, false);
                            }
                            var houseAudio = new Audio("./buying1.mp3");
                            houseAudio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            houseAudio.play();
                            engineRef.current?.applyAnimation(1);
                        }
                        // "someones" is now fully server-side — no client action needed
                        // "nothing" / skip — just end turn
                        setTimeout(() => {
                            engineRef.current?.freeDice();
                            socket.emit("finish-turn");
                        }, time_till_free);
                    },
                });
            };

            // ── afterFinished for playerMoveGENERATOR (jail animation) ──
            const afterMovementFinished = () => {
                if (args.goingToJail) {
                    setTimeout(() => {
                        const jailGen = playerMoveGENERATOR(10, xplayer, false, () => {
                            xplayer.position = 10;
                            var jailAudio = new Audio("./jail.mp3");
                            jailAudio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            jailAudio.play();
                            // isInJail/jailTurnsRemaining set by server via state_update
                            if (isActivePlayer) {
                                setTimeout(() => { engineRef.current?.freeDice(); socket.emit("finish-turn"); }, 500);
                            }
                        });
                        jailGen.func();
                    }, 800);
                }
            };

            const dice_generatorResults = playerMoveGENERATOR(rolledPosition, xplayer, true, afterMovementFinished);

            // ── diceResults onDone — handle turn end for ALL clients ──
            const handleOnDone = () => {
                if (args.jailStayed) {
                    // Stayed in jail (non-doubles) — server decremented turns, just end
                    if (isActivePlayer) {
                        engineRef.current?.freeDice();
                        socket.emit("finish-turn");
                    }
                    return;
                }
                if (args.goingToJail) return; // handled in afterMovementFinished

                if (args.pendingCard) {
                    // Show card animation for ALL clients
                    const numOfTime = 3000;
                    engineRef.current?.chorch(args.pendingCard.element, args.pendingCard.is_chance, numOfTime);
                    if (isActivePlayer && settings?.notifications === true)
                        notifyRef.current?.message(
                            `${args.pendingCard.is_chance ? "Chance" : "Community Chest"}: "${args.pendingCard.element?.title ?? ""}"`,
                            "info", 3, () => {}, false
                        );

                    setTimeout(() => {
                        // If card triggers a movement, animate it for ALL clients
                        if (args.pendingCard.newPosition !== undefined && args.pendingCard.newPosition !== rolledPosition) {
                            const cardMoveGen = playerMoveGENERATOR(args.pendingCard.newPosition, xplayer, true, () => {
                                // After card movement finishes
                                xplayer.position = args.pendingCard.newPosition;
                                SetClients(new Map(clients.set(args.turnId, xplayer)));
                                if (isActivePlayer) {
                                    if (args.pendingCard.requiresPurchaseDecision) {
                                        showBuyUI(args.pendingCard.newPosition);
                                    } else {
                                        engineRef.current?.freeDice();
                                        socket.emit("finish-turn");
                                    }
                                }
                            });
                            cardMoveGen.func();
                        } else {
                            // No movement from card (e.g. addfunds, removefunds, getout-of-jail-free)
                            if (isActivePlayer) {
                                if (args.pendingCard.requiresPurchaseDecision && args.pendingCard.newPosition !== undefined) {
                                    showBuyUI(args.pendingCard.newPosition);
                                } else {
                                    engineRef.current?.freeDice();
                                    socket.emit("finish-turn");
                                }
                            }
                        }
                    }, numOfTime);
                } else if (isActivePlayer) {
                    if (args.requiresPurchaseDecision) {
                        showBuyUI(args.finalPosition ?? rolledPosition);
                    } else {
                        // Rent/tax/free-parking etc. — all handled server-side already
                        engineRef.current?.freeDice();
                        socket.emit("finish-turn");
                    }
                }
            };

            // Determine dice display time
            const jailEscape = wasInJail && !args.jailStayed;
            const diceDisplayTime = (wasInJail && args.jailStayed) ? 2000 : dice_generatorResults.time + 2000 + 800;

            engineRef.current?.diceResults({
                l: [args.listOfNums[0], args.listOfNums[1]],
                time: diceDisplayTime,
                onDone: handleOnDone,
            });

            // ── Start movement animation ──
            if (wasInJail) {
                setTimeout(() => {
                    if (jailEscape) {
                        // Escaped with doubles — start movement after dice shown
                        setTimeout(() => { dice_generatorResults.func(); }, 2000);
                    }
                    SetClients(new Map(clients.set(args.turnId, xplayer)));
                }, 1500);
            } else {
                setTimeout(() => { dice_generatorResults.func(); }, 2000);
            }
        };

        const socket_Unjail = (args: { to: string; option: "card" | "pay" }) => {
            // Balance and jail state are updated server-side via state_update.
            // Only play audio/log here.
            const x = clients.get(args.to);
            if (x) {
                if (args.option === "pay") {
                    var audio = new Audio("./moneyminus.mp3");
                    audio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    audio.loop = false;
                    audio.play();
                } else {
                    var cardAudio = new Audio("./moneyplus.mp3");
                    cardAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    cardAudio.loop = false;
                    cardAudio.play();
                }
            }
        };
        const socket_MemberUpdating = (args: {
            playerId: string;
            animation: "recieveMoney";
            additional_props: any[];
            pJson: [PlayerJSON, PlayerJSON];
        }) => {
            for (const x of args.pJson) {
                const p = clients.get(x.id);
                x.position = p?.position ?? x.position;
                p?.recieveJson(x);
            }

            if (socket.id === args.playerId) {
                engineRef.current?.applyAnimation(2);
            }
        };
        // socket_ChorchResult: cards are now resolved server-side in roll_dice.
        // The card data arrives as pendingCard in dice_roll_result.
        // This handler is kept for backwards compatibility but does nothing.
        const socket_ChorchResult = (_args: any) => { /* no-op: handled server-side */ };
        function socket_Mouse(args: { id: string; x: number; y: number }) {
            const xplayer = clients.get(args.id);
            if (xplayer === undefined) return;
            xplayer.positions = { x: args.x, y: args.y };
            clients.set(args.id, xplayer);
        }
        function socket_networkDisconnect() {
            if (leavingRoomRef.current) {
                return;
            }
            mainTheme.pause();
            notifyRef.current?.dialog(
                (close_func, createButton) => ({
                    innerHTML: `<h3> LOST CONNECTION </h3> <p> you were disconnected from the game </p>`,
                    buttons: [
                        createButton("RETURN TO MAIN MENU", () => {
                            close_func();
                            leaveGameSession();
                        }),
                    ],
                }),
                "loosing"
            );
        }

        function socket_history(args: historyAction) {
            if (!args.balances) {
                args.balances = getBalancesSnapshot();
            }
            SetHistories((old) => [...old, args]);
        }

        function socket_playerUpdate(args: { playerId: string; pJson: PlayerJSON }) {
            const x = clients.get(args.playerId);
            if (x === undefined) return;
            x.recieveJson(args.pJson);
        }
        document.addEventListener("mousemove", mouseMove);
        socket.on("initials", socket_Initials);
        socket.on("new-player", socket_NewPlayer);
        socket.on("ready", socket_Ready);
        socket.on("start-game", socket_StartGame);
        socket.on("disconnected-player", socket_DisconnectedPlayer);
        socket.on("turn-finished", socket_TurnFinished);
        socket.on("message", socket_Message);
        socket.on("dice_roll_result", socket_DiceRollResult);
        socket.on("unjail", socket_Unjail);
        socket.on("member_updating", socket_MemberUpdating);
        socket.on("chorch_result", socket_ChorchResult);
        socket.on("mouse", socket_Mouse);
        socket.on("disconnect", socket_networkDisconnect);
        socket.on("player_update", socket_playerUpdate);
        socket.on("history", socket_history);

        socket.on("reconnecting", (attempt: number) => {
            SetReconnectAttempt(attempt);
        });
        socket.on("reconnected", () => {
            SetReconnectAttempt(null);
            notifyRef.current?.message("Reconnected successfully!", "info", 2);
        });
        socket.on("kicked", () => {
            mainTheme.pause();
            notifyRef.current?.dialog(
                (close_func, createButton) => ({
                    innerHTML: `<h3> KICKED </h3> <p> You have been kicked from the lobby by the host. </p>`,
                    buttons: [
                        createButton("RETURN TO MAIN MENU", () => {
                            close_func();
                            leaveGameSession();
                        }),
                    ],
                }),
                "loosing"
            );
        });

        // state_update: server-authoritative balance/status sync.
        // Only preserve position for the player currently being animated.
        // Everyone else accepts the server's authoritative position.
        socket.on("state_update", (args: { players: PlayerJSON[]; hostId?: string }) => {
            if (args.hostId) {
                SetHostId(args.hostId);
            }
            for (const pJson of args.players) {
                const p = clients.get(pJson.id);
                if (p) {
                    // Only preserve animated position for players currently animating
                    // (their piece is mid-animation via playerMoveGENERATOR)
                    const isBeingAnimated = animatingPlayersRef.current.has(pJson.id);
                    const savedPos = p.position;
                    p.recieveJson(pJson);
                    if (isBeingAnimated) {
                        p.position = savedPos;
                    }
                }
            }
            SetClients(new Map(clients));
            navRef.current?.reRenderPlayerList();
        });

        // Trade
        socket.on("trade", () => {
            if (!selectedMode.AllowDeals) return;
            setTrade(true);
        });
        socket.on("cancel-trade", () => {
            if (!selectedMode.AllowDeals) return;
            setTrade(undefined);
            // Also reset the action-bar sended state in case cancel came from server
            engineRef.current?.freeDice();
        });
        socket.on("trade-update", (x: GameTrading) => {
            if (!selectedMode.AllowDeals) return;
            setTrade(x);
        });

        socket.on("submit-trade", (args: { pJsons: [PlayerJSON, PlayerJSON]; action: string }) => {
            if (!selectedMode.AllowDeals) return;
            setTrade(undefined);
            // Reset the sended/action-bar state so players can act again after trade
            engineRef.current?.freeDice();
            for (const PJS of args.pJsons) {
                const client = clients.get(PJS.id);
                if (client !== undefined) {
                    client.recieveJson(PJS);
                }
            }
        });

        var to_emit_name = true;
        //#endregion
        if (to_emit_name) socket.emit("name", name);

        return () => {
            to_emit_name = false;
            clearInterval(settings_interval);
            document.removeEventListener("mousemove", mouseMove);
        };
    }, []);

    useEffect(() => {
        navRef.current?.reRenderPlayerList();
    }, [clients]);

    return (
        <>
            {gameStartedDisplay ? (
                <>
            {globalSettings !== undefined && globalSettings.accessibility[3] ? (
                <div className="cursors">
                    {Array.from(clients.values())
                        .filter((v) => v.id !== socket.id)
                        .map((v, i) => {
                            return (
                                <img
                                    src="./cursor.png"
                                    style={{
                                        translate: `${v.positions.x}px ${v.positions.y}px`,
                                    }}
                                    key={i}
                                    className="cursor"
                                />
                            );
                        })}
                </div>
            ) : (
                <></>
            )}
            <main>
                <MonopolyNav
                    currentTurn={currentId}
                    ref={navRef}
                    name={name}
                    socket={socket}
                    players={players}
                    server={server}
                    onLeave={() => {
                        leavingRoomRef.current = true;
                        sessionStorage.removeItem("current_room");
                        sessionStorage.removeItem("current_name");
                        socket.emit("leave-room");
                        socket.disconnect();
                        document.location.reload();
                    }}
                    Morgage={{
                        onCanc: (a, prpName: string) => {
                            var settings = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)).settings as MonopolySettings;
                            const localPlayer = clients.get(socket.id);
                            if (localPlayer === undefined) return;
                            if (settings !== undefined && settings.notifications === true)
                                notifyRef.current?.message(
                                    `${clients.get(socket.id)?.username ?? "unknown user"} unmortgaged ${prpName} for $${a}`,
                                    "info",
                                    2,
                                    () => {},
                                    false
                                );

                            localPlayer.balance -= a;
                            engineRef.current?.applyAnimation(1);
                            var audio = new Audio("./buying1.mp3");
                            audio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            audio.loop = false;
                            audio.play();
                            emitHistory(`${clients.get(socket.id)?.username ?? "unknown player"} unmortgaged ${prpName} for $${a}`);
                            SetClients(new Map(clients.set(socket.id, localPlayer)));
                        },
                        onMort: (a, prpName) => {
                            var settings = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)).settings as MonopolySettings;
                            const localPlayer = clients.get(socket.id);
                            if (localPlayer === undefined) return;
                            if (settings !== undefined && settings.notifications === true)
                                notifyRef.current?.message(
                                    `${clients.get(socket.id)?.username ?? "unknown user"} mortgaged ${prpName} for $${a}`,
                                    "info",
                                    2,
                                    () => {},
                                    false
                                );
                            localPlayer.balance += a; // Mortgaging GIVES cash!
                            engineRef.current?.applyAnimation(1);
                            var audio = new Audio("./buying1.mp3");
                            audio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            audio.loop = false;
                            emitHistory(`${clients.get(socket.id)?.username ?? "unknown player"} mortgaged ${prpName} for $${a}`);
                            SetClients(new Map(clients.set(socket.id, localPlayer)));
                        },
                    }}
                    callServer={() => {
                        const root = document.body.querySelector("#root") as HTMLDivElement;

                        root.style.transform = "translateX(100%)";
                    }}
                    history={histories}
                    time={startTIme}
                    selectedMode={selectedMode}
                    hostId={hostId}
                />

                <MonopolyGame
                    clickedOnBoard={(a) => {
                        navRef.current?.clickedOnBoard(a);
                    }}
                    ref={engineRef}
                    socket={socket}
                    players={Array.from(clients.values())}
                    myTurn={currentId === socket.id}
                    tradeObj={currentTrade}
                    tradeApi={{
                        onSelectPlayer(pId) {
                            const xplayer = clients.get(pId);
                            const localPlayer = clients.get(socket.id);
                            if (xplayer === undefined || localPlayer === undefined) return;
                            const x = {
                                turnPlayer: {
                                    id: localPlayer.id,
                                    balance: 0,
                                    prop: [],
                                    accepted: false,
                                },
                                againstPlayer: {
                                    id: xplayer.id,
                                    balance: 0,
                                    prop: [],
                                    accepted: false,
                                },
                            };
                            socket.emit("trade-update", x);
                        },
                    }}
                    selectedMode={selectedMode}
                />
            </main>
            <NotifyElement ref={notifyRef} />
            <div id="server">
                <main>
                    <div
                        className="upper"
                        onClick={() => {
                            const root = document.body.querySelector("#root") as HTMLDivElement;

                            root.style.transform = "";
                        }}
                    >
                        Server.exe
                    </div>
                    <div className="middle"></div>
                    <div className="lower">
                        <input type="text" />
                    </div>
                </main>
                <footer
                    onClick={() => {
                        const root = document.body.querySelector("#root") as HTMLDivElement;

                        root.style.transform = "";
                    }}
                >
                    <img src="icon.png" alt="" />
                </footer>
            </div>
        </>
    ) : (
        <>
            <NotifyElement ref={notifyRef} />
            <div className="lobby join-screen-container">
                {/* Horizontal Header (same as homepage for visual continuity) */}
                <header className="entry-header">
                    <div className="logo-group" onClick={() => { document.location.reload(); }} style={{ cursor: "pointer" }}>
                        <div className="logo-square">
                            <img src="./icon.png" alt="" className="logo-icon" />
                        </div>
                        <span className="logo-title">MONOPOLY</span>
                    </div>
                    <div className="room-info-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="pill-prefix">Room Code:</span>
                        <span className="pill-code">{server?.code || sessionStorage.getItem("current_room") || "------"}</span>
                        <button 
                            onClick={() => {
                                const code = server?.code || sessionStorage.getItem("current_room") || "";
                                if (code) {
                                    navigator.clipboard.writeText(code);
                                    setCopiedCode(true);
                                    setTimeout(() => setCopiedCode(false), 2000);
                                    notifyRef.current?.message("Room code copied to clipboard!", "info", 1.5);
                                }
                            }}
                            className="copy-room-code-btn"
                            title="Copy Code"
                            style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: 'var(--text-main)',
                                fontSize: '11px',
                                fontFamily: 'var(--font-outfit)',
                                fontWeight: 600,
                                padding: '2px 8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                marginLeft: '4px'
                            }}
                        >
                            {copiedCode ? "Copied!" : "Copy"}
                        </button>
                    </div>
                <div className="user-profile">
                    <div className="profile-avatar" style={{ backgroundColor: '#ffc107', color: '#111', fontWeight: 'bold' }}>
                        👑
                    </div>
                    <div className="profile-info">
                        <span className="profile-name">Game Lobby</span>
                        <span className="profile-handle">Ready to launch</span>
                    </div>
                </div>
            </header>

            <div className="two-column-layout">
                {/* LEFT COLUMN: Lobby Players List */}
                <div className="left-column">
                    <div className="lobbies-board-card">
                        <div className="board-header">
                            <div style={{ textAlign: "left" }}>
                                <h3 className="section-title">Hello there, {name}</h3>
                                <p className="section-subtitle">Players currently connected to this multiplayer session.</p>
                            </div>
                        </div>

                        <div className="lobbies-scroll-list" style={{ minHeight: "220px" }}>
                            {Array.from(clients.values()).map((v, i) => {
                                const isHost = v.id === hostId;
                                const isLocal = v.id === socket.id;
                                // Harmonious palette matching color options on homepage
                                const avatarColors = ["#f35f5f", "#ea7a53", "#f1b53e", "#3bb36c", "#4f8eff"];
                                const avatarColor = avatarColors[i % avatarColors.length];

                                return (
                                    <div 
                                        key={i}
                                        className={`lobby-row-item lobby-player-row ${v.ready ? 'ready-row' : 'pending-row'}`}
                                    >
                                        <div className="lobby-row-left">
                                            <div className="player-avatar-circle" style={{ backgroundColor: avatarColor }}>
                                                {v.username ? v.username.charAt(0).toUpperCase() : 'P'}
                                            </div>
                                            <span className="player-name-label">
                                                {v.username} {isLocal && <span className="local-user-indicator">(You)</span>}
                                            </span>
                                            {isHost && <span className="host-badge">👑 Host</span>}
                                            {!v.connected && <span className="offline-badge">Offline</span>}
                                        </div>
                                        <div className="lobby-row-right">
                                            <span className={`player-ready-pill ${v.ready ? 'is-ready' : 'is-pending'}`}>
                                                {v.ready ? "READY" : "WAITING"}
                                            </span>
                                            {hostId === socket.id && !isLocal && (
                                                <button 
                                                    onClick={() => socket.emit("kick-player", v.id)}
                                                    className="kick-player-btn"
                                                    title="Kick Player"
                                                >
                                                    &times;
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom action bars for ready/leave */}
                        <div className="search-bar-horizontal lobby-actions-row">
                            <button
                                disabled={gameStarted}
                                onClick={() => {
                                    socket.emit("ready", {
                                        ready: !imReady,
                                    });
                                    SetReady(!imReady);
                                }}
                                className={`lobby-ready-toggle-btn ${imReady ? 'is-ready' : 'is-pending'}`}
                            >
                                {imReady ? "Toggle Unready" : "Toggle Ready"}
                            </button>
                            
                            <button
                                onClick={() => {
                                    sessionStorage.removeItem("current_room");
                                    sessionStorage.removeItem("current_name");
                                    socket.emit("leave-room");
                                    socket.disconnect();
                                    document.location.reload();
                                }}
                                className="lobby-leave-btn"
                            >
                                Leave Lobby
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Mode settings & configs (styled like Create reminder in screenshot) */}
                <div className="right-column">
                    <div className="profile-details-card">
                        <div className="card-header-bar">
                            <h3 className="card-title">Match Settings</h3>
                        </div>

                        {/* Game Mode Pill Selection */}
                        <div className="reminder-type-section">
                            <label className="section-label">SELECT GAME MODE</label>
                            <div className="color-pills-row game-modes-pills">
                                {MonopolyModes.map((v, k) => {
                                    const isSelected = JSON.stringify(v) === JSON.stringify(selectedMode);
                                    // Map color indices to give different styles matching the picture
                                    const colors = ["orange", "yellow", "green", "blue"];
                                    const colorClass = colors[k % colors.length] + "-pill";
                                    return (
                                        <button
                                            key={k}
                                            type="button"
                                            className={`color-pill ${colorClass} ${isSelected ? "active" : ""}`}
                                            onClick={() => {
                                                if (server !== undefined)
                                                    socket.emit("ready", {
                                                        mode: v,
                                                    });
                                            }}
                                            disabled={server === undefined}
                                        >
                                            <span className={`pill-dot ${colors[k % colors.length]}-dot`}></span> {v.Name}
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    className={`color-pill red-pill ${selectedMode.Name === "Custom Mode" ? "active" : ""}`}
                                    onClick={() => {
                                        const winstateChoice = window.prompt("Winning State\n1=last-standing\n2=monopols\n3=monopols & trains", "3");
                                        const allowTrade = window.confirm("Allow Trades");
                                        const allowMortgage = window.confirm("Allow Mortgage");
                                        const startingCash = window.prompt("Starting Cash", "1500");
                                        const turnTimer = window.prompt("Turn Timer", "0");
                                        const v = {
                                            AllowDeals: allowTrade,
                                            WinningMode:
                                                winstateChoice === "2" ? "monopols" : winstateChoice === "3" ? "monopols & trains" : "last-standing",
                                            Name: "Custom Mode",
                                            mortageAllowed: allowMortgage,
                                            startingCash: startingCash === null ? 1500 : parseInt(startingCash) ?? 1500,
                                            turnTimer: turnTimer === null ? undefined : parseInt(turnTimer) ?? undefined,
                                        } as MonopolyMode;
                                        if (server !== undefined)
                                            socket.emit("ready", {
                                                mode: v,
                                            });
                                    }}
                                    disabled={server === undefined}
                                >
                                    <span className="pill-dot red-dot"></span> Custom Mode
                                </button>
                            </div>
                        </div>

                        {/* Match details list */}
                        <div className="event-details-section">
                            <label className="section-label">MATCH SETUP SUMMARY</label>
                            
                            <div className="details-info-row">
                                <span className="details-icon">🏆</span>
                                <span className="details-text">Winning Mode: <strong className="highlight-text">{selectedMode.WinningMode.toUpperCase()}</strong></span>
                            </div>
                            
                            <div className="details-info-row">
                                <span className="details-icon">🤝</span>
                                <span className="details-text">Trades: <strong className="highlight-text">{selectedMode.AllowDeals ? "ALLOWED" : "DISABLED"}</strong></span>
                            </div>

                            <div className="details-info-row">
                                <span className="details-icon">🏢</span>
                                <span className="details-text">Mortgages: <strong className="highlight-text">{selectedMode.mortageAllowed ? "ALLOWED" : "DISABLED"}</strong></span>
                            </div>

                            <div className="details-info-row">
                                <span className="details-icon">💰</span>
                                <span className="details-text">Starting Cash: <strong className="highlight-text">{selectedMode.startingCash}M</strong></span>
                            </div>

                            <div className="details-info-row">
                                <span className="details-icon">⏱️</span>
                                <span className="details-text">
                                    Turn Timer: <strong className="highlight-text">
                                        {selectedMode.turnTimer === undefined ||
                                        (typeof selectedMode.turnTimer === "number" && selectedMode.turnTimer === 0)
                                            ? "NO TIMER"
                                            : JSON.stringify(selectedMode.turnTimer) + " SEC"}
                                    </strong>
                                </span>
                            </div>
                        </div>

                        {/* Large Primary Action Button */}
                        <div className="action-button-container">
                            {server === undefined ? (
                                <button className="primary-action-btn lobby-client-status" disabled={true}>
                                    Waiting for Host to Start...
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        socket.emit("ready", { ready: !imReady });
                                        SetReady(!imReady);
                                    }}
                                    className={`primary-action-btn ${imReady ? 'host-ready-active' : ''}`}
                                >
                                    {imReady ? "Toggle Unready" : "Toggle Ready (Host)"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <p id="floating-clock"></p>
        </div>
        </>
    )}

    {reconnectAttempt !== null && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999999999,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontFamily: 'system-ui, sans-serif'
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '40px',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px'
            }}>
                <div className="spinner" style={{
                    width: '50px',
                    height: '50px',
                    border: '5px solid rgba(255, 255, 255, 0.1)',
                    borderTop: '5px solid #0075ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
                <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>Lost Connection</h3>
                <p style={{ margin: 0, opacity: 0.8 }}>Attempting to reconnect... [Attempt {reconnectAttempt}/5]</p>
            </div>
        </div>
    )}
    </>
    );
}

export default App;
