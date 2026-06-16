import { useState, useRef, useEffect } from "react";
import Monopoly from "./monopoly.tsx";
import "./home.css";
import { Server, Socket, io } from "../../utils/sockets";
import NotifyElement, { NotificatorRef } from "../../components/notificator.tsx";
import { MonopolyCookie } from "../../types";
import SettingsNav from "../../components/settingsNav.tsx";
import JoinScreen from "../../components/menu/joinScreen.tsx";
import { TranslateCode } from "../../utils/code";
import { CookieManager } from "../../utils/cookieManager";

export default function Home() {
    var cookie: MonopolyCookie;
    try {
        const getCookieString = CookieManager.get("monopolySettings");
        if (getCookieString === null) throw new Error("no cookie");
        const obj = JSON.parse(decodeURIComponent(getCookieString));
        cookie = obj;
        if (!cookie.settings) {
            cookie.settings = {
                gameEngine: "2d",
                accessibility: [45, 5, false, false, true],
                audio: [100, 100, 5],
                notifications: true
            };
            CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookie as MonopolyCookie)));
        }
    } catch {
        cookie = {
            login: {
                remember: false,
                id: "",
            },
            settings: {
                gameEngine: "2d",
                accessibility: [45, 5, false, false, true],
                audio: [100, 100, 5],
                notifications: true
            }
        } as MonopolyCookie;

        CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookie as MonopolyCookie)));
    }

    const notifyRef = useRef<NotificatorRef>(null);
    const [socket, SetSocket] = useState<Socket>();
    // Gameplay stuff
    const [name, SetName] = useState<string>("");
    const [addr, SetAddress] = useState<string>("");

    const [disabled, SetDisabled] = useState<boolean>(false);
    const [isSignedIn, SetSignedIn] = useState<boolean>(false);
    const [tabIndex, SetTab] = useState<number>(0);

    // Server Stuff
    const [server, SetServer] = useState<Server | undefined>(undefined);

    function resetSavedGameSession() {
        const keysToRemove: string[] = [];

        for (let index = 0; index < sessionStorage.length; index += 1) {
            const key = sessionStorage.key(index);
            if (key === null) continue;
            if (key === "current_room" || key === "current_name" || key.startsWith("monopoly_token_")) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            sessionStorage.removeItem(key);
        }

        // Also clear the persistent username so it doesn't interfere with a fresh start
        localStorage.removeItem("current_name");

        SetDisabled(false);
        SetSocket(undefined);
        SetName("");
        SetAddress("");
        notifyRef.current?.message("Saved game session cleared", "info", 2);
        document.location.reload();
    }

    useEffect(() => {
        document.title = "Monopoly";
        try {
            JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string));
        } catch {}
    }, []);

    const joinButtonClicked = async (forceAddress?: string, forceName?: string) => {
        const joinName = forceName || name;
        const joinAddr = forceAddress || addr;

        if (joinName.replace(" ", "").length === 0) {
            notifyRef.current?.message("please add your name before joining", "info", 2);
            return;
        }

        sessionStorage.setItem("current_room", joinAddr);
        localStorage.setItem("current_name", joinName);

        try {
            const cookieObj = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)) as MonopolyCookie;
            cookieObj.login = {
                id: "",
                remember: false,
            };
            CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookieObj)));
        } catch {
            const cookieObj = {
                login: {
                    id: "",
                    remember: false,
                },
            } as MonopolyCookie;
            CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookieObj)));
        }
        SetDisabled(true);

        const address = TranslateCode(joinAddr) as string;
        var socketObj: Socket;
        try {
            socketObj = await io(address);

            socketObj.on("state", (args: number) => {
                console.log("state");
                switch (args) {
                    case 0:
                        SetSocket(socketObj);
                        SetName(joinName);
                        SetAddress(joinAddr);
                        SetSignedIn(true);
                        SetDisabled(false);
                        break;
                    case 1:
                        // Game already started — clear saved room so page reload doesn't auto-rejoin
                        sessionStorage.removeItem("current_room");
                        notifyRef.current?.message("the game has already begun", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socketObj.disconnect();
                        break;
                    case 2:
                        // Room full — clear saved room so page reload doesn't auto-rejoin
                        sessionStorage.removeItem("current_room");
                        notifyRef.current?.message("too many players on the server", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socketObj.disconnect();
                        break;
                    default:
                        notifyRef.current?.message("unkown error", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socketObj.disconnect();
                        break;
                }
            });
        } catch (r) {
            // Clear the stale session so the next page refresh doesn't auto-rejoin
            // a room that no longer exists, causing an infinite retry loop.
            sessionStorage.removeItem("current_room");
            sessionStorage.removeItem("monopoly_token_" + TranslateCode(joinAddr));
            const errMsg = r === "Room not found" ? "Room not found — session cleared" : `Could not connect to peer ${addr}`;
            notifyRef.current?.message(errMsg, "error", 2, () => {
                SetDisabled(false);
            });
        }
    };

    useEffect(() => {
        const uriParams = new URLSearchParams(document.location.search);
        if (uriParams.has("ip")) {
            SetAddress(uriParams.get("ip") ?? "");
        }

        const storedRoom = sessionStorage.getItem("current_room");
        const storedName = localStorage.getItem("current_name") || sessionStorage.getItem("current_name");
        if (storedName) {
            SetName(storedName);
        }
        if (storedRoom && storedName) {
            SetAddress(storedRoom);
            joinButtonClicked(storedRoom, storedName);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (name) {
            localStorage.setItem("current_name", name);
        }
    }, [name]);

    async function createRoomAndJoin(playersCount: number) {
        try {
            if (name.replace(" ", "").length === 0) {
                notifyRef.current?.message("please add your name before joining", "info", 2);
                return;
            }

            SetDisabled(true);
            try {
                const response = await fetch("/api/create-room", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ playersCount })
                });
                const data = await response.json();
                if (data.success) {
                    sessionStorage.setItem("current_room", data.hostCode);
                    localStorage.setItem("current_name", name);
                    
                    const virtualServer = new Server();
                    virtualServer.code = data.translatedCode; // RAW code
                    
                    const socketObj = await io(TranslateCode(virtualServer.code));
                    socketObj.on("state", (args: number) => {
                        switch (args) {
                            case 0:
                                SetSocket(socketObj);
                                SetSignedIn(true);
                                SetServer(virtualServer);
                                SetDisabled(false);
                                break;
                            default:
                                socketObj.disconnect();
                                SetDisabled(false);
                                break;
                        }
                    });
                }
            } catch (err) {
                console.error(err);
                SetDisabled(false);
            }
        } catch {
            SetDisabled(false);
        }
    }

    return socket !== undefined && isSignedIn === true ? (
        <Monopoly socket={socket} name={name} server={server} />
    ) : (
        <>
            <NotifyElement ref={notifyRef} />
            <div className="entry">
                <header className="entry-header">
                    <div className="logo-group" onClick={() => { document.location.href = "/"; }} style={{ cursor: "pointer" }}>
                        <div className="logo-square">
                            <img src="./icon.png" alt="" className="logo-icon" />
                        </div>
                        <span className="logo-title">MONOPOLY</span>
                    </div>
                    <nav className="entry-nav">
                        <button
                            data-select={tabIndex === 0}
                            onClick={() => SetTab(0)}
                            className="nav-item"
                        >
                            Play Game
                        </button>
                        <button
                            data-select={tabIndex === 4}
                            onClick={() => SetTab(4)}
                            className="nav-item"
                        >
                            Settings
                        </button>
                    </nav>
                    <div className="user-profile">
                        <div className="profile-avatar">
                            {name ? name.charAt(0).toUpperCase() : 'G'}
                        </div>
                        <div className="profile-info">
                            <input
                                type="text"
                                className="header-name-input"
                                value={name}
                                onChange={(e) => SetName(e.target.value)}
                                placeholder="Enter Username..."
                                maxLength={16}
                                title="Click to edit your name"
                            />
                            <span className="profile-handle">@{name ? name.toLowerCase().replace(/\s+/g, '') : "guest"}</span>
                        </div>
                    </div>
                </header>
                <main className="entry-main">
                    {tabIndex === 4 ? (
                        <SettingsNav />
                    ) : (
                        <>
                            <JoinScreen
                                disabled={disabled}
                                joinViaCode={() => {
                                    joinButtonClicked();
                                }}
                                createRoom={(count) => {
                                    createRoomAndJoin(count);
                                }}
                                SetAddress={SetAddress}
                                SetName={SetName}
                                addr={addr}
                                name={name}
                            />
                            <div className="reset-session-container">
                                <button
                                    className="btn-secondary btn-reset"
                                    onClick={resetSavedGameSession}
                                >
                                    Reset Saved Game Session
                                </button>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </>
    );
}
