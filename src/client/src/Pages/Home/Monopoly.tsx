import { useState, useEffect, useRef } from "react";
import { Server, Socket } from "../../utils/sockets";
import { Player, PlayerJSON } from "../../utils/player";
import "./monopoly.css";
import MonopolyNav, { MonopolyNavRef } from "../../components/ingame/Nav.tsx";
import InsightsTab from "../../components/ingame/InsightsTab.tsx";
import MonopolyGame, { MonopolyGameRef } from "../../components/ingame/Game.tsx";
import NotifyElement, { NotificatorRef } from "../../components/Notificator.tsx";
import monopolyJSON from "../../../../shared/data/monopoly.json";
import { Icons } from "../../components/icons";
import DebugPanel from "../../components/ingame/DebugPanel.tsx";
import CustomRulesModal from "../../components/ingame/CustomRulesModal.tsx";
import {
    MonopolySettings,
    MonopolyModes,
    historyAction,
    history,
    GameTrading,
    MonopolyMode,
    MonopolyCookie,
    GameStats,
} from "../../../../shared/types/game";
import { CookieManager } from "../../utils/cookieManager";
import { logger } from "../../utils/logger";
function App({
    socket,
    name,
    server,
    isSpectator = false,
}: {
    socket: Socket;
    name: string;
    server: Server | undefined;
    isSpectator?: boolean;
}) {
    const [clients, SetClients] = useState<Map<string, Player>>(new Map());
    const players = Array.from(clients.values());
    const clientsRef = useRef(clients);
    clientsRef.current = clients;

    const leaveGameSession = () => {
        sessionStorage.removeItem("current_room");
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
    const gameStartedRef = useRef(gameStarted);
    gameStartedRef.current = gameStarted;
    const [gameStartedDisplay, SetGameStartedDisplay] = useState<boolean>(false);
    const [imReady, SetReady] = useState<boolean>(false);
    const [selectedMode, SetMode] = useState<MonopolyMode>(MonopolyModes[0]);
    const [customConfig, setCustomConfig] = useState<MonopolyMode>({
        AllowDeals: true,
        WinningMode: "last-standing",
        Name: "Custom Mode",
        mortageAllowed: true,
        startingCash: 1500,
        turnTimer: undefined,
        allowAuctions: true,
    });
    const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
    const selectedModeRef = useRef(selectedMode);
    selectedModeRef.current = selectedMode;
    const [hostId, SetHostId] = useState<string>("");
    const [reconnectAttempt, SetReconnectAttempt] = useState<number | null>(null);
    const [copiedCode, setCopiedCode] = useState<boolean>(false);
    // Phase 2F — turn-flow state
    const [hasRolled, setHasRolled] = useState<boolean>(false);
    const [allowRollAgain, setAllowRollAgain] = useState<boolean>(false);
    const [isDebtState, setIsDebtState] = useState<boolean>(false);
    // Fix 5b: mortgage transfer choice state (for the creditor when a bankruptcy happens)
    const [mortgageTransferPending, setMortgageTransferPending] = useState<
        | {
              position: number;
              name: string;
              mortgageValue: number;
              interestFee: number;
              unmortgageCost: number;
          }[]
        | null
    >(null);
    const [mortgageBankruptName, setMortgageBankruptName] = useState<string>("");

    // Phase 2 — Housing & Hotel pool states
    const [bankHouses, setBankHouses] = useState<number>(32);
    const [bankHotels, setBankHotels] = useState<number>(12);

    // Phase 2 — Property Auction states
    const [currentAuction, setCurrentAuction] = useState<{
        position: number;
        name: string;
        price: number;
        currentBid: number;
        bidderId: string;
        bidderName: string;
        timerSeconds: number;
        bids: Array<{ bidderName: string; amount: number }>;
    } | null>(null);
    const hasRolledRef = useRef(hasRolled);
    hasRolledRef.current = hasRolled;
    const allowRollAgainRef = useRef(allowRollAgain);
    allowRollAgainRef.current = allowRollAgain;
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
            logger.error("Failed to load global settings cookie", e);
        }
        return {
            gameEngine: "2d",
            accessibility: [45, 5, false, false, true],
            audio: [100, 100, 5],
            notifications: true,
        };
    });
    const [mainTheme, SetTheme] = useState(new Audio("./main-theme.mp3"));
    const [startTIme, SetStartTime] = useState<Date>(new Date());
    const [histories, SetHistories] = useState<Array<historyAction>>([]);
    const [gameStats, setGameStats] = useState<GameStats | null>(null);
    const [showInsights, setShowInsights] = useState<boolean>(false);

    const [currentTrade, setTrade] = useState<GameTrading | boolean | undefined>(undefined);
    const leavingRoomRef = useRef<boolean>(false);

    const [isDebugUnlocked, setIsDebugUnlocked] = useState<boolean>(
        () => sessionStorage.getItem("debug_unlocked") === "true",
    );
    const isDebugMode = isDebugUnlocked;

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
                logger.error("Failed to parse settings cookie in interval", e);
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

    // Phase 2F — keep isDebtState in sync with local player's balance
    useEffect(() => {
        const localPlayer = clients.get(socket.id);
        if (localPlayer) {
            setIsDebtState(localPlayer.balance < 0);
            setHasRolled(localPlayer.hasRolled);
            setAllowRollAgain(localPlayer.allowRollAgain);
        } else {
            setIsDebtState(false);
            setHasRolled(false);
            setAllowRollAgain(false);
        }
    }, [clients]);

    const engineRef = useRef<MonopolyGameRef>(null);
    const navRef = useRef<MonopolyNavRef>(null);
    const notifyRef = useRef<NotificatorRef>(null);
    const animatingPlayersRef = useRef<Set<string>>(new Set());

    const propretyMap = new Map(
        monopolyJSON.properties.map((obj) => {
            return [obj.posistion ?? 0, obj];
        }),
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
                logger.error("Failed to parse settings cookie in mouse handler interval", e);
            }
        }, 1000);

        function mouseMove(e: MouseEvent) {
            const _pos = { x: e.clientX, y: e.clientY };
            const xplayer = clientsRef.current.get(socket.id);
            socket.emit("mouse", _pos);
            xplayer ? (xplayer.positions = _pos) : "";
        }

        const showWinDialog = (winner: Player, reason: string) => {
            mainTheme.pause();
            SetGameStarted(false);
            SetGameStartedDisplay(false);
            const isLocal = winner.id === socket.id;
            const title = isLocal ? "YOU WON!" : `${winner.username} WON!`;
            const description = isLocal ? reason : reason.replace(/\byou\b/gi, winner.username);
            notifyRef.current?.dialog(
                (close_func, createButton) => ({
                    innerHTML: `<h3>${title}</h3><p>${description}</p>`,
                    buttons: [
                        createButton("LEAVE GAME", () => {
                            close_func();
                            leaveGameSession();
                        }),
                    ],
                }),
                "winning",
            );
        };

        const checkVictory = (updatedClients: Map<string, Player>): boolean => {
            if (!gameStartedRef.current) return false;
            const winMode = selectedModeRef.current?.WinningMode ?? "last-standing";
            const activePlayers = Array.from(updatedClients.values()).filter((p) => !p.isBankrupt);

            // 1. check last-standing regardless of mode, if only one remains
            if (activePlayers.length === 1) {
                const winner = activePlayers[0];
                showWinDialog(winner, "All other players went bankrupt.");
                return true;
            }

            // 2. check other conditions if not last-standing
            if (winMode !== "last-standing") {
                for (const p of activePlayers) {
                    // Count completed sets
                    const prpGrups: string[] = [];
                    for (const prp of p.properties) {
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
                        showWinDialog(p, "you have completed 3 or more color groups!");
                        return true;
                    }

                    if (winMode === "monopols & trains") {
                        const railroadsOwned = p.properties.filter((v) => v.group === "Railroad").length;
                        if (railroadsOwned >= 4) {
                            showWinDialog(p, "you have completed 4 railroads!");
                            return true;
                        }
                    }
                }
            }
            return false;
        };

        function destroyPlayer(playerId: string) {
            // remove player from clients
            function removePlayer() {
                const nextClients = new Map(clientsRef.current);
                nextClients.delete(playerId);
                SetClients(nextClients);

                // 1 frame to check if it isnt removed
                requestAnimationFrame(() => {
                    if (clientsRef.current.has(playerId)) {
                        // request a loop frame!
                        requestAnimationFrame(removePlayer);
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
                    }
                });
            }
            removeChild();
        }

        function playerMoveGENERATOR(
            final_position: number,
            _xplayer: Player,
            get200whengo = true,
            afterFinished?: () => void,
            adding = true,
        ) {
            animatingPlayersRef.current.add(_xplayer.id);
            let sum_moves = (final_position - _xplayer.position) % 40;
            if ((final_position < _xplayer.position || sum_moves < 0) && adding) {
                sum_moves = 40 - _xplayer.position + final_position;
            }

            if (!adding) {
                sum_moves = _xplayer.position - final_position;
                if (sum_moves < 0) {
                    sum_moves += 40;
                }
            }

            if (sum_moves === 0) {
                return {
                    func: () => {
                        animatingPlayersRef.current.delete(_xplayer.id);
                        if (afterFinished) afterFinished();
                    },
                    time: 0,
                };
            }

            const time = 0.35 * 1000 * sum_moves;

            logger.debug(
                `${new Date().toTimeString()} generator ${Math.random()} target ${final_position} time ${time} current ${_xplayer.position}`,
            );
            function _playerMoveFunc() {
                let firstPosition = 0;
                let addedMoney = false;
                let i = 0;
                const element = document.querySelector(`div.player[player-id="${_xplayer.id}"]`) as HTMLDivElement;

                firstPosition = _xplayer.position;
                _xplayer.position = (_xplayer.position + (adding ? 1 : -1) + 40) % 40;
                const audio = new Audio("./step2.mp3");
                audio.volume = 0.1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                audio.loop = false;
                audio.play();
                element.style.animation = "jumpstreet 0.35s cubic-bezier(.26,1.5,.65,1.02)";
                const movingAnim = () => {
                    if (i < sum_moves) {
                        i += 1;
                        const stepAudio = new Audio("./step2.mp3");
                        stepAudio.volume =
                            1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        stepAudio.loop = false;
                        stepAudio.play();
                        _xplayer.position = (_xplayer.position + (adding ? 1 : -1) + 40) % 40;
                        if (_xplayer.position == 0 && get200whengo) {
                            // Go payment is handled server-side — just play audio/animation
                            const goAudio = new Audio("./moneyplus.mp3");
                            goAudio.volume =
                                1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            goAudio.loop = false;
                            goAudio.play();
                            addedMoney = true;
                            SetClients(new Map(clientsRef.current.set(_xplayer.id, _xplayer)));
                        }
                        if (i == sum_moves - 1) {
                            _xplayer.position = final_position;
                            element.style.animation = "part 0.9s cubic-bezier(0,.7,.57,1)";
                            setTimeout(() => {
                                element.style.animation = "";
                            }, 900);

                            if (!addedMoney && firstPosition > _xplayer.position && get200whengo && adding) {
                                // Go payment is handled server-side — just play audio
                                const goAudio2 = new Audio("./moneyplus.mp3");
                                goAudio2.volume =
                                    1 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                                goAudio2.loop = false;
                                goAudio2.play();
                                addedMoney = true;
                                SetClients(new Map(clientsRef.current.set(_xplayer.id, _xplayer)));
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
        const socket_Initials = (args: {
            turn_id: string;
            other_players: Array<PlayerJSON>;
            selectedMode: MonopolyMode;
            gameStarted?: boolean;
            hostId?: string;
            history?: Array<historyAction>;
            stats?: GameStats;
        }) => {
            SetCurrent(args.turn_id.toString());
            const newClients = new Map(clientsRef.current);
            for (const x of args.other_players) {
                newClients.set(x.id, new Player(x.id, x.username).recieveJson(x));
            }
            SetClients(newClients);
            SetMode(args.selectedMode);
            if (args.selectedMode.Name === "Custom Mode") {
                setCustomConfig(args.selectedMode);
            }
            if (args.gameStarted) {
                SetGameStarted(true);
                SetGameStartedDisplay(true);
            }
            if (args.hostId) {
                SetHostId(args.hostId);
            }
            if (args.history) {
                SetHistories(args.history);
            }
            if (args.stats) {
                setGameStats(args.stats);
            }
        };

        const socket_NewPlayer = (args: PlayerJSON) => {
            const nextClients = new Map(clientsRef.current);
            nextClients.set(args.id, new Player(args.id, args.username).recieveJson(args));
            SetClients(nextClients);
        };

        const socket_Ready = (args: { id: string; state: boolean; selectedMode: MonopolyMode }) => {
            const nextClients = new Map(clientsRef.current);
            const x = nextClients.get(args.id);
            if (x === undefined) return;
            x.ready = args.state;
            SetClients(nextClients);
            SetMode(args.selectedMode);
            if (args.selectedMode.Name === "Custom Mode") {
                setCustomConfig(args.selectedMode);
            }
        };
        const socket_StartGame = () => {
            SetGameStarted(true);
            function A(n: number) {
                const p = document.querySelector("p#floating-clock") as HTMLParagraphElement;
                if (p) {
                    p.innerHTML = `${n}`;
                    p.className = "clocking";
                }
            }
            A(3);
            setTimeout(() => {
                A(2);
                setTimeout(() => {
                    A(1);
                    setTimeout(() => {
                        const p = document.querySelector("p#floating-clock") as HTMLParagraphElement;
                        if (p) {
                            p.innerHTML = "";
                            p.className = "";
                        }
                        SetGameStartedDisplay(true);
                    }, 1000);
                }, 1000);
            }, 1000);
        };

        const socket_DisconnectedPlayer = (args: { id: string; turn: string; wasInGame?: boolean }) => {
            SetCurrent(args.turn);
            const name = clientsRef.current.get(args.id)?.username ?? "player";
            if (args.wasInGame) {
                notifyRef.current?.message(`${name} disconnected temporarily... waiting to reconnect!`, "info");
                return; // Do not destroy the player!
            }
            if (!gameStartedRef.current) {
                notifyRef.current?.message(`${name} left the lobby`, "info");
            } else if (clientsRef.current.size > 2) {
                notifyRef.current?.message(`${name} disconnected`, "error");
            } else if (clientsRef.current.has(args.id)) {
                mainTheme.pause();
                notifyRef.current?.dialog(
                    (close_func, createButton) => ({
                        innerHTML: `<h3> YOU WON! </h3> <p> your the only left player with the balance of ${
                            clientsRef.current.get(socket.id)?.balance ?? 0
                        } </p>`,
                        buttons: [
                            createButton("LEAVE GAME", () => {
                                close_func();
                                leaveGameSession();
                            }),
                        ],
                    }),
                    "winning",
                );
            }
            destroyPlayer(args.id);
        };

        const socket_TurnFinished = (args: {
            from: string;
            turnId: string;
            pJson: PlayerJSON;
            WinningMode: string;
        }) => {
            const x = clientsRef.current.get(args.from);

            // Phase 2F: Reset turn-flow state when any turn ends
            setHasRolled(false);
            setAllowRollAgain(false);

            if (x !== undefined && JSON.stringify(x.properties) != JSON.stringify(args.pJson.properties)) {
                // sound part - other player part
                const audio = new Audio("./buying1.mp3");
                audio.volume = 0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                audio.loop = false;
                audio.play();
            }

            const updatedClients = new Map(clientsRef.current);
            if (x) {
                x.recieveJson(args.pJson);
                updatedClients.set(args.from, x);
            }
            SetClients(updatedClients);

            if (checkVictory(updatedClients)) return;

            SetCurrent(args.turnId);
            if (args.turnId === socket.id) {
                const x = clientsRef.current.get(args.turnId);
                if (x && x.isInJail) {
                    engineRef.current?.showJailsButtons((x?.getoutCards ?? -1) > 0);
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
            forcedJailPayment?: number; // Fix #6: set to 50 when 3rd jail attempt forces payment
            allowRollAgain?: boolean; // Phase 2E: true when player rolled doubles and may roll again
        }) => {
            const xplayer = clientsRef.current.get(args.turnId) as Player;
            const wasInJail = xplayer?.isInJail;
            const audio = new Audio("./rolling.mp3");
            audio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
            audio.loop = false;
            audio.play();

            const isActivePlayer = args.turnId === socket.id;
            const rolls = args.listOfNums[0] + args.listOfNums[1];
            const rolledPosition = args.listOfNums[2]; // position before jail correction

            // Phase 2F: Track hasRolled / allowRollAgain for the active player
            if (isActivePlayer) {
                setHasRolled(true);
                setAllowRollAgain(args.allowRollAgain ?? false);
            }

            // ── Helpers to defer notifications/audios until movement animations finish ──
            const triggerGoNotification = () => {
                const goAudio = new Audio("./moneyplus.mp3");
                goAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                goAudio.loop = false;
                goAudio.play();
                if (isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(`$200 added for passing Go!`, "info", 2, () => {}, false);
                    engineRef.current?.applyAnimation(2);
                }
            };

            const triggerLandingNotification = (note: string) => {
                if (isActivePlayer) {
                    if (note.startsWith("incometax")) {
                        if (settings?.notifications === true)
                            notifyRef.current?.message(`Paid $200 income tax`, "info", 2, () => {}, false);
                        const taxAudio = new Audio("./moneyminus.mp3");
                        taxAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        taxAudio.play();
                        engineRef.current?.applyAnimation(1);
                    } else if (note.startsWith("luxerytax")) {
                        if (settings?.notifications === true)
                            notifyRef.current?.message(`Paid $100 luxury tax`, "info", 2, () => {}, false);
                        const taxAudio2 = new Audio("./moneyminus.mp3");
                        taxAudio2.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        taxAudio2.play();
                        engineRef.current?.applyAnimation(1);
                    } else if (note.startsWith("rent:")) {
                        const [, ownerId, rentAmt] = note.split(":");
                        const ownerName = clientsRef.current.get(ownerId)?.username ?? "someone";
                        if (settings?.notifications === true)
                            notifyRef.current?.message(
                                `Paid $${rentAmt} rent to ${ownerName}`,
                                "info",
                                2,
                                () => {},
                                false,
                            );
                        const rentAudio = new Audio("./moneyminus.mp3");
                        rentAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        rentAudio.play();
                        engineRef.current?.applyAnimation(1);
                    }
                }

                // Notify owner on rent received
                if (note.startsWith("rent:")) {
                    const ownerId = note.split(":")[1];
                    const rentAmt = note.split(":")[2];
                    if (ownerId === socket.id && !isActivePlayer) {
                        if (settings?.notifications === true)
                            notifyRef.current?.message(`Received $${rentAmt} rent`, "info", 2, () => {}, false);
                        const rentRecAudio = new Audio("./moneyplus.mp3");
                        rentRecAudio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                        rentRecAudio.play();
                        engineRef.current?.applyAnimation(2);
                    }
                }
            };

            // ── Helper: show property buy/upgrade UI and emit player_action ──
            const showBuyUI = (location: number) => {
                const proprety = propretyMap.get(location);
                if (!proprety) {
                    engineRef.current?.freeDice();
                    if (!allowRollAgainRef.current) {
                        socket.emit("finish-turn");
                    }
                    return;
                }
                engineRef.current?.setStreet({
                    location,
                    rolls,
                    onResponse: (b: string, info: any) => {
                        const time_till_free = 0;
                        if (b === "buy" || b === "special_action") {
                            socket.emit("player_action", { action: "buy" });
                            if (settings?.notifications === true)
                                notifyRef.current?.message(
                                    `${clientsRef.current.get(socket.id)?.username ?? "you"} bought ${proprety?.name ?? "a property"} for $${proprety?.price ?? 0}`,
                                    "info",
                                    2,
                                    () => {},
                                    false,
                                );
                            const buyAudio = new Audio("./buying1.mp3");
                            buyAudio.volume =
                                0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            buyAudio.play();
                            engineRef.current?.applyAnimation(1);
                        } else if (b === "advance-buy") {
                            const _info = info as { state: 1 | 2 | 3 | 4 | 5; money: number };
                            socket.emit("player_action", {
                                action: "buy-advance",
                                newCount: _info.state,
                                housesAdded: _info.money,
                            });
                            if (_info.state === 5) {
                                if (settings?.notifications === true)
                                    notifyRef.current?.message(
                                        `Built a hotel on ${proprety?.name}`,
                                        "info",
                                        2,
                                        () => {},
                                        false,
                                    );
                            } else {
                                if (settings?.notifications === true)
                                    notifyRef.current?.message(
                                        `Built ${_info.money} house${_info.money > 1 ? "s" : ""} on ${proprety?.name}`,
                                        "info",
                                        2,
                                        () => {},
                                        false,
                                    );
                            }
                            const houseAudio = new Audio("./buying1.mp3");
                            houseAudio.volume =
                                0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            houseAudio.play();
                            engineRef.current?.applyAnimation(1);
                        }
                        // "someones" is now fully server-side — no client action needed
                        // "nothing" / skip — just end turn
                        setTimeout(() => {
                            engineRef.current?.freeDice();
                            if (b === "nothing") {
                                socket.emit("player_action", { action: "skip" });
                                if (!selectedModeRef.current.allowAuctions) {
                                    if (allowRollAgainRef.current) {
                                        // Doubles! Do NOT finish turn, just free dice for another roll!
                                    } else {
                                        socket.emit("finish-turn");
                                    }
                                }
                            } else {
                                if (allowRollAgainRef.current) {
                                    // Doubles! Do NOT finish turn, just free dice for another roll!
                                } else {
                                    socket.emit("finish-turn");
                                }
                            }
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
                            const jailAudio = new Audio("./jail.mp3");
                            jailAudio.volume =
                                0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                            jailAudio.play();
                            // isInJail/jailTurnsRemaining set by server via state_update
                            if (isActivePlayer) {
                                setTimeout(() => {
                                    engineRef.current?.freeDice();
                                    socket.emit("finish-turn");
                                }, 500);
                            }
                        });
                        jailGen.func();
                    }, 800);
                } else {
                    // Normal roll movement finished: trigger deferred rent/tax/GO
                    if (args.passedGo) {
                        triggerGoNotification();
                    }
                    if (args.landingNote && !args.pendingCard) {
                        triggerLandingNotification(args.landingNote);
                    }
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
                // Fix #6: forced jail payment ($50 on 3rd failed attempt)
                if (args.forcedJailPayment && args.forcedJailPayment > 0 && isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(
                            `Paid $${args.forcedJailPayment} (forced) — released from Jail after 3 failed attempts`,
                            "info",
                            3,
                            () => {},
                            false,
                        );
                    engineRef.current?.applyAnimation(1);
                }
                if (args.goingToJail) return; // handled in afterMovementFinished

                // Phase 2G: Inter-player card notifications
                if (args.pendingCard?.element?.action === "addfundsfromplayers" && !isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(
                            `Paid $${args.pendingCard.element.amount} to ${clientsRef.current.get(args.turnId)?.username ?? "active player"}`,
                            "info",
                            3,
                            () => {},
                            false,
                        );
                    engineRef.current?.applyAnimation(1);
                }
                if (args.pendingCard?.element?.action === "removefundstoplayers" && !isActivePlayer) {
                    if (settings?.notifications === true)
                        notifyRef.current?.message(
                            `Received $${args.pendingCard.element.amount} from ${clientsRef.current.get(args.turnId)?.username ?? "active player"}`,
                            "info",
                            3,
                            () => {},
                            false,
                        );
                    engineRef.current?.applyAnimation(2);
                }

                if (args.pendingCard) {
                    // Show card animation for ALL clients
                    const numOfTime = 3000;
                    engineRef.current?.chorch(args.pendingCard.element, args.pendingCard.is_chance, numOfTime);
                    if (isActivePlayer && settings?.notifications === true)
                        notifyRef.current?.message(
                            `${args.pendingCard.is_chance ? "Chance" : "Community Chest"}: "${args.pendingCard.element?.title ?? ""}"`,
                            "info",
                            3,
                            () => {},
                            false,
                        );

                    setTimeout(() => {
                        // If card triggers a movement, animate it for ALL clients
                        if (
                            args.pendingCard.newPosition !== undefined &&
                            args.pendingCard.newPosition !== rolledPosition
                        ) {
                            // Fix #5: detect backward moves (e.g. "Go Back 3 Spaces" has count: -3)
                            const isBackward =
                                args.pendingCard.element?.count !== undefined &&
                                typeof args.pendingCard.element.count === "number" &&
                                args.pendingCard.element.count < 0;
                            const cardPassedGo =
                                args.pendingCard.newPosition !== undefined &&
                                args.pendingCard.newPosition < rolledPosition &&
                                !isBackward;
                            const cardMoveGen = playerMoveGENERATOR(
                                args.pendingCard.newPosition,
                                xplayer,
                                !isBackward,
                                () => {
                                    xplayer.position = args.pendingCard.newPosition;
                                    SetClients(new Map(clientsRef.current.set(args.turnId, xplayer)));

                                    if (cardPassedGo) {
                                        triggerGoNotification();
                                    }
                                    if (args.landingNote) {
                                        triggerLandingNotification(args.landingNote);
                                    }

                                    const nested = args.pendingCard.pendingCard;
                                    if (nested) {
                                        engineRef.current?.chorch(nested.element, nested.is_chance, numOfTime);
                                        if (isActivePlayer && settings?.notifications === true)
                                            notifyRef.current?.message(
                                                `${nested.is_chance ? "Chance" : "Community Chest"}: "${nested.element?.title ?? ""}"`,
                                                "info",
                                                3,
                                                () => {},
                                                false,
                                            );
                                        setTimeout(() => {
                                            if (isActivePlayer) {
                                                if (
                                                    nested.requiresPurchaseDecision &&
                                                    nested.newPosition !== undefined
                                                ) {
                                                    showBuyUI(nested.newPosition);
                                                } else {
                                                    if (args.allowRollAgain) {
                                                        engineRef.current?.freeDice();
                                                    } else {
                                                        engineRef.current?.freeDice();
                                                        socket.emit("finish-turn");
                                                    }
                                                }
                                            }
                                        }, numOfTime);
                                    } else {
                                        if (isActivePlayer) {
                                            if (args.pendingCard.requiresPurchaseDecision) {
                                                showBuyUI(args.pendingCard.newPosition);
                                            } else {
                                                // Phase 2E: Re-roll on doubles if applicable
                                                if (args.allowRollAgain) {
                                                    engineRef.current?.freeDice();
                                                } else {
                                                    engineRef.current?.freeDice();
                                                    socket.emit("finish-turn");
                                                }
                                            }
                                        }
                                    }
                                },
                                !isBackward,
                            );
                            cardMoveGen.func();
                        } else {
                            // No movement from card
                            if (args.landingNote) {
                                triggerLandingNotification(args.landingNote);
                            }
                            if (isActivePlayer) {
                                if (
                                    args.pendingCard.requiresPurchaseDecision &&
                                    args.pendingCard.newPosition !== undefined
                                ) {
                                    showBuyUI(args.pendingCard.newPosition);
                                } else {
                                    // Phase 2E: Re-roll on doubles if applicable
                                    if (args.allowRollAgain) {
                                        engineRef.current?.freeDice();
                                    } else {
                                        engineRef.current?.freeDice();
                                        socket.emit("finish-turn");
                                    }
                                }
                            }
                        }
                    }, numOfTime);
                } else if (isActivePlayer) {
                    if (args.requiresPurchaseDecision) {
                        showBuyUI(args.finalPosition ?? rolledPosition);
                    } else {
                        // Phase 2E: Re-roll on doubles if applicable
                        if (args.allowRollAgain) {
                            // Doubles! Re-enable roll button — do NOT emit finish-turn
                            engineRef.current?.freeDice();
                        } else {
                            engineRef.current?.freeDice();
                            socket.emit("finish-turn");
                        }
                    }
                }
            };

            // Determine dice display time
            const jailEscape = wasInJail && !args.jailStayed;
            const diceDisplayTime = wasInJail && args.jailStayed ? 2000 : dice_generatorResults.time + 2000 + 800;

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
                        setTimeout(() => {
                            dice_generatorResults.func();
                        }, 2000);
                    }
                    SetClients(new Map(clientsRef.current.set(args.turnId, xplayer)));
                }, 1500);
            } else {
                setTimeout(() => {
                    dice_generatorResults.func();
                }, 2000);
            }
        };

        const socket_Unjail = (args: { to: string; option: "card" | "pay" }) => {
            // Balance and jail state are updated server-side via state_update.
            // Only play audio/log here.
            const x = clientsRef.current.get(args.to);
            if (x) {
                if (args.option === "pay") {
                    const audio = new Audio("./moneyminus.mp3");
                    audio.volume = ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                    audio.loop = false;
                    audio.play();
                    // Phase 2G: Notify local player about the $50 unjail payment
                    if (args.to === socket.id && settings?.notifications === true)
                        notifyRef.current?.message("Paid $50 to leave Jail", "info", 2, () => {}, false);
                } else {
                    const cardAudio = new Audio("./moneyplus.mp3");
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
                const p = clientsRef.current.get(x.id);
                if (p) {
                    x.position = p.position;
                    p.recieveJson(x);
                }
            }
            SetClients(new Map(clientsRef.current));

            if (socket.id === args.playerId) {
                engineRef.current?.applyAnimation(2);
            }
        };
        // socket_ChorchResult: cards are now resolved server-side in roll_dice.
        // The card data arrives as pendingCard in dice_roll_result.
        // This handler is kept for backwards compatibility but does nothing.
        const socket_ChorchResult = (_args: any) => {
            /* no-op: handled server-side */
        };
        function socket_Mouse(args: { id: string; x: number; y: number }) {
            const xplayer = clientsRef.current.get(args.id);
            if (xplayer === undefined) return;
            xplayer.positions = { x: args.x, y: args.y };
        }
        function socket_networkDisconnect(code?: string) {
            if (leavingRoomRef.current) {
                return;
            }
            mainTheme.pause();
            const isRoomNotFound = code === "ROOM_NOT_FOUND";
            const title = isRoomNotFound ? "LOBBY DESTROYED" : "LOST CONNECTION";
            const description = isRoomNotFound
                ? "The game lobby no longer exists or the host closed the connection."
                : "You were disconnected from the game.";

            notifyRef.current?.dialog(
                (close_func, createButton) => ({
                    innerHTML: `<h3> ${title} </h3> <p> ${description} </p>`,
                    buttons: [
                        createButton("RETURN TO MAIN MENU", () => {
                            close_func();
                            leaveGameSession();
                        }),
                    ],
                }),
                "loosing",
            );
        }

        function socket_history(args: historyAction) {
            if (!args.balances) {
                args.balances = getBalancesSnapshot();
            }
            SetHistories((old) => [...old, args]);
        }

        function socket_playerUpdate(args: { playerId: string; pJson: PlayerJSON }) {
            const x = clientsRef.current.get(args.playerId);
            if (x === undefined) return;
            x.recieveJson(args.pJson);
            SetClients(new Map(clientsRef.current));
        }

        const socket_AuctionStart = (args: {
            position: number;
            name: string;
            price: number;
            startingBid: number;
            timerSeconds: number;
            bids: Array<{ bidderName: string; amount: number }>;
        }) => {
            setCurrentAuction({
                position: args.position,
                name: args.name,
                price: args.price,
                currentBid: 0,
                bidderId: "",
                bidderName: "",
                timerSeconds: args.timerSeconds,
                bids: args.bids,
            });
        };

        const socket_AuctionUpdate = (args: {
            bid: number;
            bidderId: string;
            bidderName: string;
            timerSeconds: number;
            bids: Array<{ bidderName: string; amount: number }>;
        }) => {
            setCurrentAuction((prev) =>
                prev
                    ? {
                          ...prev,
                          currentBid: args.bid,
                          bidderId: args.bidderId,
                          bidderName: args.bidderName,
                          timerSeconds: args.timerSeconds,
                          bids: args.bids,
                      }
                    : null,
            );
        };

        const socket_AuctionTick = (args: { timerSeconds: number }) => {
            setCurrentAuction((prev) => (prev ? { ...prev, timerSeconds: args.timerSeconds } : null));
        };

        const socket_AuctionEnd = (args: { winnerId: string; winnerName: string; bid: number; position: number }) => {
            setCurrentAuction(null);
            notifyRef.current?.message(
                `Auction finished! ${args.winnerName} won the auction for $${args.bid}.`,
                "info",
                4,
            );
        };

        const socket_AuctionSkip = (_args: { position: number }) => {
            setCurrentAuction(null);
            notifyRef.current?.message("Auction finished with no bids.", "info", 3);
        };

        const socket_PoolShortage = (args: { type: string; message: string }) => {
            notifyRef.current?.message(args.message, "error", 4);
        };

        if (!isSpectator) {
            document.addEventListener("mousemove", mouseMove);
        }
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
        socket.on("auction-start", socket_AuctionStart);
        socket.on("auction-update", socket_AuctionUpdate);
        socket.on("auction-tick", socket_AuctionTick);
        socket.on("auction-end", socket_AuctionEnd);
        socket.on("auction-skip", socket_AuctionSkip);
        socket.on("pool-shortage", socket_PoolShortage);
        socket.on("error-message", (args: { event?: string; message: string; details?: any }) => {
            notifyRef.current?.message(args.message, "error", 4);
        });

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
                "loosing",
            );
        });

        // state_update: server-authoritative balance/status sync.
        // Only preserve position for the player currently being animated.
        // Everyone else accepts the server's authoritative position.
        socket.on(
            "state_update",
            (args: {
                players: PlayerJSON[];
                hostId?: string;
                bankHouses?: number;
                bankHotels?: number;
                stats?: GameStats;
            }) => {
                if (args.hostId) {
                    SetHostId(args.hostId);
                }
                if (args.bankHouses !== undefined) setBankHouses(args.bankHouses);
                if (args.bankHotels !== undefined) setBankHotels(args.bankHotels);
                if (args.stats) {
                    setGameStats(args.stats);
                }
                const nextClients = new Map(clientsRef.current);
                for (const pJson of args.players) {
                    const p = nextClients.get(pJson.id);
                    if (p) {
                        // Only preserve animated position for players currently animating
                        // (their piece is mid-animation via playerMoveGENERATOR)
                        const isBeingAnimated = animatingPlayersRef.current.has(pJson.id);
                        const savedPos = p.position;
                        p.recieveJson(pJson);
                        if (isBeingAnimated) {
                            p.position = savedPos;
                        }
                    } else {
                        // Create if not exists to avoid losing newly connected players
                        nextClients.set(pJson.id, new Player(pJson.id, pJson.username).recieveJson(pJson));
                    }
                }
                SetClients(nextClients);
                navRef.current?.reRenderPlayerList();
                checkVictory(nextClients);

                // Turn state is now synchronized directly via player class properties
            },
        );

        // Trade
        socket.on("trade", () => {
            if (!selectedModeRef.current.AllowDeals) return;
            setTrade(true);
        });
        socket.on("cancel-trade", () => {
            if (!selectedModeRef.current.AllowDeals) return;
            setTrade(undefined);
            // Also reset the action-bar sended state in case cancel came from server
            engineRef.current?.freeDice();
        });
        socket.on("trade-update", (x: GameTrading) => {
            if (!selectedModeRef.current.AllowDeals) return;
            setTrade(x);
        });

        socket.on("submit-trade", (args: { pJsons: [PlayerJSON, PlayerJSON]; action: string }) => {
            if (!selectedModeRef.current.AllowDeals) return;
            setTrade(undefined);
            // Reset the sended/action-bar state so players can act again after trade
            engineRef.current?.freeDice();
            // Phase 2G: Notify local player about cash involved in the trade
            const localPJson = args.pJsons.find((p) => p.id === socket.id);
            const nextClients = new Map(clientsRef.current);
            if (localPJson && settings?.notifications === true) {
                const prev = nextClients.get(socket.id)?.balance ?? localPJson.balance;
                const diff = localPJson.balance - prev;
                if (diff > 0) notifyRef.current?.message(`Trade: received $${diff}`, "info", 2, () => {}, false);
                else if (diff < 0)
                    notifyRef.current?.message(`Trade: paid $${Math.abs(diff)}`, "info", 2, () => {}, false);
            }
            for (const PJS of args.pJsons) {
                const client = nextClients.get(PJS.id);
                if (client !== undefined) {
                    client.recieveJson(PJS);
                }
            }
            SetClients(nextClients);
            checkVictory(nextClients);
        });

        // Phase 2B: Handle player-bankrupt event
        socket.on(
            "player-bankrupt",
            (args: { bankruptId: string; creditorId: string | "bank"; turnId: string; pJsons: PlayerJSON[] }) => {
                const nextClients = new Map(clientsRef.current);
                // Update all player states from server truth
                for (const pJson of args.pJsons) {
                    const p = nextClients.get(pJson.id);
                    if (p) p.recieveJson(pJson);
                }
                SetClients(nextClients);
                SetCurrent(args.turnId);
                // Phase 2F: Reset turn-flow state on bankruptcy
                setHasRolled(false);
                setAllowRollAgain(false);
                // Fix 5b: clear any pending mortgage modal when bankruptcy finalizes
                setMortgageTransferPending(null);

                const bankruptName = nextClients.get(args.bankruptId)?.username ?? "A player";
                if (args.bankruptId === socket.id) {
                    // Local player went bankrupt
                    mainTheme.pause();
                    notifyRef.current?.dialog(
                        (close_func, createButton) => ({
                            innerHTML: `<h3>YOU WENT BANKRUPT</h3><p>You can continue watching the game as a spectator.</p>`,
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
                        "loosing",
                    );
                } else {
                    notifyRef.current?.message(`${bankruptName} declared bankruptcy!`, "error", 3);
                }

                // Check if only 1 active player remains → winner
                checkVictory(nextClients);
                navRef.current?.reRenderPlayerList();
            },
        );

        // Fix 5b: creditor receives mortgaged properties — show choice modal
        socket.on(
            "mortgage-transfer-pending",
            (args: {
                properties: {
                    position: number;
                    name: string;
                    mortgageValue: number;
                    interestFee: number;
                    unmortgageCost: number;
                }[];
                bankruptName: string;
            }) => {
                setMortgageBankruptName(args.bankruptName);
                setMortgageTransferPending(args.properties);
            },
        );

        // Game Debugger authentication handlers
        socket.on("debug_auth_success", () => {
            sessionStorage.setItem("debug_unlocked", "true");
            setIsDebugUnlocked(true);
            notifyRef.current?.message("Game Debugger unlocked successfully!", "info", 2);
        });

        socket.on("debug_auth_failed", () => {
            sessionStorage.setItem("debug_unlocked", "false");
            setIsDebugUnlocked(false);
            sessionStorage.removeItem("debug_password");
            notifyRef.current?.message("Incorrect Game Debugger password!", "error", 2.5);
            window.dispatchEvent(new CustomEvent("debug_auth_failed_event"));
        });

        socket.on("debug_notice", (args: { message: string }) => {
            notifyRef.current?.message(args.message, "warn", 4);
        });
        const handleDebugToggleAuth = (e: any) => {
            const { password } = e.detail;
            if (password) {
                socket.emit("debug_authenticate", { password });
            } else {
                setIsDebugUnlocked(false);
            }
        };
        window.addEventListener("debug_toggle_auth", handleDebugToggleAuth);

        // Auto-authenticate on mount if password is saved or debug query param is present
        const savedPass = sessionStorage.getItem("debug_password");
        if (savedPass) {
            socket.emit("debug_authenticate", { password: savedPass });
        } else {
            const queryParams = new URLSearchParams(window.location.search);
            if (queryParams.get("debug") === "1") {
                const pass = prompt("Enter Game Debugger Password:");
                if (pass) {
                    sessionStorage.setItem("debug_password", pass);
                    socket.emit("debug_authenticate", { password: pass });
                }
            }
        }

        let to_emit_name = true;
        //#endregion
        if (to_emit_name) {
            if (isSpectator) {
                socket.emit("spectator", name);
            } else {
                socket.emit("name", name);
            }
        }

        return () => {
            to_emit_name = false;
            clearInterval(settings_interval);
            if (!isSpectator) {
                document.removeEventListener("mousemove", mouseMove);
            }
            window.removeEventListener("debug_toggle_auth", handleDebugToggleAuth);
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
                            isSpectator={isSpectator}
                            currentTurn={currentId}
                            ref={navRef}
                            name={name}
                            socket={socket}
                            players={players}
                            server={server}
                            onLeave={() => {
                                leavingRoomRef.current = true;
                                sessionStorage.removeItem("current_room");
                                socket.emit("leave-room");
                                socket.disconnect();
                                document.location.reload();
                            }}
                            Morgage={{
                                onCanc: (a, prpName: string) => {
                                    const settings = JSON.parse(
                                        decodeURIComponent(CookieManager.get("monopolySettings") as string),
                                    ).settings as MonopolySettings;
                                    const localPlayer = clients.get(socket.id);
                                    if (localPlayer === undefined) return;
                                    if (settings !== undefined && settings.notifications === true)
                                        notifyRef.current?.message(
                                            `${clients.get(socket.id)?.username ?? "unknown user"} unmortgaged ${prpName} for $${a}`,
                                            "info",
                                            2,
                                            () => {},
                                            false,
                                        );

                                    localPlayer.balance -= a;
                                    engineRef.current?.applyAnimation(1);
                                    const audio = new Audio("./buying1.mp3");
                                    audio.volume =
                                        0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                                    audio.loop = false;
                                    audio.play();
                                    emitHistory(
                                        `${clients.get(socket.id)?.username ?? "unknown player"} unmortgaged ${prpName} for $${a}`,
                                    );
                                    SetClients(new Map(clients.set(socket.id, localPlayer)));
                                },
                                onMort: (a, prpName) => {
                                    const settings = JSON.parse(
                                        decodeURIComponent(CookieManager.get("monopolySettings") as string),
                                    ).settings as MonopolySettings;
                                    const localPlayer = clients.get(socket.id);
                                    if (localPlayer === undefined) return;
                                    if (settings !== undefined && settings.notifications === true)
                                        notifyRef.current?.message(
                                            `${clients.get(socket.id)?.username ?? "unknown user"} mortgaged ${prpName} for $${a}`,
                                            "info",
                                            2,
                                            () => {},
                                            false,
                                        );
                                    localPlayer.balance += a; // Mortgaging GIVES cash!
                                    engineRef.current?.applyAnimation(1);
                                    const audio = new Audio("./buying1.mp3");
                                    audio.volume =
                                        0.5 * ((settings?.audio[1] ?? 100) / 100) * ((settings?.audio[0] ?? 100) / 100);
                                    audio.loop = false;
                                    emitHistory(
                                        `${clients.get(socket.id)?.username ?? "unknown player"} mortgaged ${prpName} for $${a}`,
                                    );
                                    SetClients(new Map(clients.set(socket.id, localPlayer)));
                                },
                            }}
                            callServer={() => {
                                const root = document.body.querySelector("#root") as HTMLDivElement;

                                root.style.transform = "translateX(100%)";
                            }}
                            history={histories}
                            stats={gameStats}
                            showInsights={showInsights}
                            onToggleInsights={() => setShowInsights((prev) => !prev)}
                            time={startTIme}
                            selectedMode={selectedMode}
                            hostId={hostId}
                            bankHouses={bankHouses}
                            bankHotels={bankHotels}
                        />

                        <MonopolyGame
                            isSpectator={isSpectator}
                            clickedOnBoard={(a) => {
                                navRef.current?.clickedOnBoard(a);
                            }}
                            ref={engineRef}
                            socket={socket}
                            players={Array.from(clients.values())}
                            myTurn={currentId === socket.id && !isSpectator}
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
                            hasRolled={hasRolled}
                            allowRollAgain={allowRollAgain}
                            isDebtState={isDebtState}
                            mortgageTransferPending={mortgageTransferPending}
                            mortgageBankruptName={mortgageBankruptName}
                            currentAuction={currentAuction}
                            onMortgageTransferResolve={(choices) => {
                                socket.emit("mortgage-transfer-resolve", { choices });
                                setMortgageTransferPending(null);
                            }}
                            onDeclaredBankruptcy={() => {
                                setHasRolled(false);
                                setAllowRollAgain(false);
                            }}
                        />
                    </main>
                    <NotifyElement ref={notifyRef} />
                    {showInsights && (
                        <div className="insights-bottom-drawer">
                            <div className="insights-drawer-backdrop" onClick={() => setShowInsights(false)} />
                            <div className="insights-drawer-panel">
                                <button className="insights-drawer-close" onClick={() => setShowInsights(false)}>
                                    ✕
                                </button>
                                <InsightsTab stats={gameStats} players={players} />
                            </div>
                        </div>
                    )}
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

                    {isDebugMode && (
                        <DebugPanel
                            socket={socket}
                            clients={clients}
                            notifyRef={notifyRef}
                            setHasRolled={setHasRolled}
                            setAllowRollAgain={setAllowRollAgain}
                            setIsDebtState={setIsDebtState}
                            setMortgageBankruptName={setMortgageBankruptName}
                            setMortgageTransferPending={setMortgageTransferPending}
                        />
                    )}
                </>
            ) : (
                <>
                    <NotifyElement ref={notifyRef} />
                    <div className="lobby join-screen-container">
                        {/* Horizontal Header (same as homepage for visual continuity) */}
                        <header className="entry-header">
                            <div
                                className="logo-group"
                                onClick={() => {
                                    document.location.reload();
                                }}
                                style={{ cursor: "pointer" }}
                            >
                                <div className="logo-square">
                                    <img src="./icon.png" alt="" className="logo-icon" />
                                </div>
                                <span className="logo-title">MONOPOLY</span>
                            </div>
                            <div
                                className="room-info-pill"
                                style={{ display: "flex", alignItems: "center", gap: "8px" }}
                            >
                                <span className="pill-prefix">Room Code:</span>
                                <span className="pill-code">
                                    {server?.code || sessionStorage.getItem("current_room") || "------"}
                                </span>
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
                                        background: "rgba(255, 255, 255, 0.08)",
                                        border: "1px solid rgba(255, 255, 255, 0.1)",
                                        borderRadius: "6px",
                                        color: "var(--text-main)",
                                        fontSize: "11px",
                                        fontFamily: "var(--font-outfit)",
                                        fontWeight: 600,
                                        padding: "2px 8px",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        marginLeft: "4px",
                                    }}
                                >
                                    {copiedCode ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <div className="user-profile">
                                <div
                                    className="profile-avatar"
                                    style={{
                                        backgroundColor: "#ffc107",
                                        color: "#111",
                                        fontWeight: "bold",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Icons.Crown width={18} height={18} />
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
                                            <h3 className="section-title">
                                                Hello there, {name}{" "}
                                                {isSpectator && (
                                                    <span
                                                        style={{
                                                            fontSize: "0.8em",
                                                            color: "#94a3b8",
                                                            marginLeft: "6px",
                                                        }}
                                                    >
                                                        (Spectating)
                                                    </span>
                                                )}
                                            </h3>
                                            <p className="section-subtitle">
                                                Players currently connected to this multiplayer session.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="lobbies-scroll-list" style={{ minHeight: "220px" }}>
                                        {Array.from(clients.values()).map((v, i) => {
                                            const isHost = v.id === hostId;
                                            const isLocal = v.id === socket.id;
                                            const avatarColor = v.color || "#64748b";

                                            return (
                                                <div
                                                    key={i}
                                                    className={`lobby-row-item lobby-player-row ${v.ready ? "ready-row" : "pending-row"}`}
                                                >
                                                    <div className="lobby-row-left">
                                                        <div
                                                            className="player-avatar-circle"
                                                            style={{
                                                                backgroundColor: avatarColor,
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                padding: "2px",
                                                            }}
                                                        >
                                                            <img
                                                                src={`./p${v.icon + 1}.png`}
                                                                alt=""
                                                                style={{
                                                                    width: "80%",
                                                                    height: "80%",
                                                                    objectFit: "contain",
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="player-name-label">
                                                            {v.username}{" "}
                                                            {isLocal && (
                                                                <span className="local-user-indicator">(You)</span>
                                                            )}
                                                        </span>
                                                        {isHost && (
                                                            <span className="host-badge">
                                                                <Icons.Crown
                                                                    width={10}
                                                                    height={10}
                                                                    style={{ verticalAlign: "middle", marginRight: 2 }}
                                                                />
                                                                Host
                                                            </span>
                                                        )}
                                                        {!v.connected && <span className="offline-badge">Offline</span>}
                                                    </div>
                                                    <div className="lobby-row-right">
                                                        <span
                                                            className={`player-ready-pill ${v.ready ? "is-ready" : "is-pending"}`}
                                                        >
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
                                        {isSpectator ? (
                                            <button className="lobby-ready-toggle-btn is-ready" disabled={true}>
                                                Spectating Lobby
                                            </button>
                                        ) : (
                                            <button
                                                disabled={gameStarted}
                                                onClick={() => {
                                                    socket.emit("ready", {
                                                        ready: !imReady,
                                                    });
                                                    SetReady(!imReady);
                                                }}
                                                className={`lobby-ready-toggle-btn ${imReady ? "is-ready" : "is-pending"}`}
                                            >
                                                {imReady ? "Toggle Unready" : "Toggle Ready"}
                                            </button>
                                        )}

                                        <button
                                            onClick={() => {
                                                sessionStorage.removeItem("current_room");
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
                                                        <span
                                                            className={`pill-dot ${colors[k % colors.length]}-dot`}
                                                        ></span>{" "}
                                                        {v.Name}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                className={`color-pill red-pill ${selectedMode.Name === "Custom Mode" ? "active" : ""}`}
                                                onClick={() => {
                                                    if (server !== undefined)
                                                        socket.emit("ready", {
                                                            mode: customConfig,
                                                        });
                                                }}
                                                disabled={server === undefined}
                                            >
                                                <span className="pill-dot red-dot"></span> Custom Mode
                                            </button>
                                            {selectedMode.Name === "Custom Mode" && server !== undefined && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCustomModal(true)}
                                                    style={{
                                                        padding: "8px 12px",
                                                        borderRadius: "16px",
                                                        backgroundColor: "rgba(255, 255, 255, 0.07)",
                                                        border: "1px solid var(--border-color)",
                                                        color: "#fff",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "6px",
                                                        cursor: "pointer",
                                                        fontSize: "12px",
                                                        fontWeight: "500",
                                                        transition: "all 0.2s",
                                                    }}
                                                    title="Configure Custom Mode"
                                                >
                                                    <Icons.Wrench width={12} height={12} /> Configure
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Player Color and Avatar Selection */}
                                    {!isSpectator && (
                                        <div
                                            className="reminder-type-section"
                                            style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}
                                        >
                                            <label className="section-label">SELECT YOUR AVATAR & COLOR</label>
                                            <div className="avatar-selection-grid">
                                                {(() => {
                                                    const myPlayer = clients.get(socket.id);
                                                    const myIconIndex = myPlayer ? myPlayer.icon : 0;
                                                    const colors = [
                                                        "#E0115F",
                                                        "#4169e1",
                                                        "#50C878",
                                                        "#FFC000",
                                                        "#a855f7",
                                                        "#FF7F50",
                                                    ];

                                                    return colors.map((col, idx) => {
                                                        const takenBy = Array.from(clients.values()).find(
                                                            (p) => p.id !== socket.id && p.icon === idx,
                                                        );
                                                        const isSelected = myIconIndex === idx;

                                                        return (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                className={`avatar-choice-btn ${isSelected ? "active" : ""} ${takenBy ? "taken" : ""}`}
                                                                style={{
                                                                    backgroundColor: col,
                                                                }}
                                                                disabled={!!takenBy}
                                                                onClick={() => {
                                                                    socket.emit("select_icon", idx);
                                                                }}
                                                                title={
                                                                    takenBy
                                                                        ? `Taken by ${takenBy.username}`
                                                                        : `Select Color`
                                                                }
                                                            >
                                                                <img
                                                                    src={`./p${idx + 1}.png`}
                                                                    alt=""
                                                                    className="avatar-choice-img"
                                                                />
                                                                {takenBy && (
                                                                    <span className="avatar-taken-badge">
                                                                        {takenBy.username.charAt(0).toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    )}

                                    {/* Match details list */}
                                    <div className="event-details-section">
                                        <label className="section-label">MATCH SETUP SUMMARY</label>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Trophy width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Winning Mode:{" "}
                                                <strong className="highlight-text">
                                                    {selectedMode.WinningMode.toUpperCase()}
                                                </strong>
                                            </span>
                                        </div>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Handshake width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Trades:{" "}
                                                <strong className="highlight-text">
                                                    {selectedMode.AllowDeals ? "ALLOWED" : "DISABLED"}
                                                </strong>
                                            </span>
                                        </div>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Building width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Mortgages:{" "}
                                                <strong className="highlight-text">
                                                    {selectedMode.mortageAllowed ? "ALLOWED" : "DISABLED"}
                                                </strong>
                                            </span>
                                        </div>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Scale width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Auctions:{" "}
                                                <strong className="highlight-text">
                                                    {selectedMode.allowAuctions !== false ? "ALLOWED" : "DISABLED"}
                                                </strong>
                                            </span>
                                        </div>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Coin width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Starting Cash:{" "}
                                                <strong className="highlight-text">{selectedMode.startingCash}M</strong>
                                            </span>
                                        </div>

                                        <div className="details-info-row">
                                            <span className="details-icon">
                                                <Icons.Timer width={13} height={13} />
                                            </span>
                                            <span className="details-text">
                                                Turn Timer:{" "}
                                                <strong className="highlight-text">
                                                    {selectedMode.turnTimer === undefined ||
                                                    (typeof selectedMode.turnTimer === "number" &&
                                                        selectedMode.turnTimer === 0)
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
                                                className={`primary-action-btn ${imReady ? "host-ready-active" : ""}`}
                                            >
                                                {imReady ? "Toggle Unready" : "Toggle Ready (Host)"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Floating countdown clock — must always be in the DOM so socket_StartGame
        can query it via getElementById before gameStartedDisplay becomes true. */}
            <p id="floating-clock"></p>

            {reconnectAttempt !== null && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        backgroundColor: "rgba(0, 0, 0, 0.7)",
                        backdropFilter: "blur(10px)",
                        zIndex: 9999999999,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        color: "white",
                        fontFamily: "system-ui, sans-serif",
                    }}
                >
                    <div
                        style={{
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "16px",
                            padding: "40px",
                            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "20px",
                        }}
                    >
                        <div
                            className="spinner"
                            style={{
                                width: "50px",
                                height: "50px",
                                border: "5px solid rgba(255, 255, 255, 0.1)",
                                borderTop: "5px solid #0075ff",
                                borderRadius: "50%",
                                animation: "spin 1s linear infinite",
                            }}
                        ></div>
                        <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
                        <h3 style={{ margin: 0, fontSize: "24px", fontWeight: "600" }}>Lost Connection</h3>
                        <p style={{ margin: 0, opacity: 0.8 }}>
                            Attempting to reconnect... [Attempt {reconnectAttempt}/5]
                        </p>
                    </div>
                </div>
            )}

            {showCustomModal && (
                <CustomRulesModal
                    onClose={() => setShowCustomModal(false)}
                    customConfig={customConfig}
                    setCustomConfig={setCustomConfig}
                    socket={socket}
                />
            )}
        </>
    );
}

export default App;
