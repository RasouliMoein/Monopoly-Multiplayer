import { useState, useRef, useEffect } from "react";
import Monopoly from "./monopoly.tsx";
import "../../home.css";
import { Server, Socket, io } from "../../assets/sockets.ts";
import NotifyElement, { NotificatorRef } from "../../components/notificator.tsx";
import { MonopolyCookie, User, botInitial } from "../../assets/types.ts";
import SettingsNav from "../../components/settingsNav.tsx";

// import LoginScreen from "../../components/menu/loginscreen.tsx";
import JoinScreen from "../../components/menu/joinScreen.tsx";
// env
// import { FirebaseApp, initializeApp } from "firebase/app";
// import { doc, getDoc, getFirestore } from "firebase/firestore";

// import { main as botServer } from "../../assets/bot/server.ts";
import { main as runBot } from "../../assets/bot/bot.ts";
import { TranslateCode } from "../../assets/code.ts";
import { CookieManager } from "../../assets/cookieManager.ts";

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

    // Account stuff
    // const [firebase, setFirebase] = useState<FirebaseApp>();
    const [
        remember,
        // @ts-ignore
        SetRemember,
    ] = useState<boolean>(cookie.login.remember);
    const [
        fbUser,
        // @ts-ignore
        SetFbUser,
    ] = useState<User>();

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

        SetDisabled(false);
        SetSocket(undefined);
        SetName("");
        SetAddress("");
        notifyRef.current?.message("Saved game session cleared", "info", 2);
        document.location.reload();
    }

    useEffect(() => {
        document.title = "Monopoly";
        // const _firebase = initializeApp(ENV.firebase);
        // setFirebase(_firebase);
        var cookie: MonopolyCookie;
        try {
            const obj = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string));
            cookie = obj;
            if (cookie.login.remember && cookie.login.id.length > 0) {
                // const db = getFirestore(_firebase);
                // getDoc(doc(db, `Users/${cookie.login.id}`)).then((v) => {
                //     const userData = v.data() as User;
                //     SetFbUser(userData);
                //     SetName(userData.name);
                // });
            }
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
        sessionStorage.setItem("current_name", joinName);

        try {
            const cookie = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)) as MonopolyCookie;
            if (fbUser === undefined) throw Error("undefined");

            cookie.login = {
                id: fbUser.id,
                remember,
            };

            CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookie as MonopolyCookie)));
        } catch {
            const cookie = {
                login: {
                    id: "",
                    remember: false,
                },
            } as MonopolyCookie;
            CookieManager.set("monopolySettings", encodeURIComponent(JSON.stringify(cookie as MonopolyCookie)));
        }
        SetDisabled(true);

        const address = TranslateCode(joinAddr) as string;
        var socket: Socket;
        // const address = "localhost"
        try {
            socket = await io(address);

            socket.on("state", (args: number) => {
                console.log("state");
                switch (args) {
                    case 0:
                        SetSocket(socket);
                        SetName(joinName);
                        SetAddress(joinAddr);
                        SetSignedIn(true);
                        SetDisabled(false);
                        break;
                    case 1:
                        notifyRef.current?.message("the game has already begun", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socket.disconnect();
                        break;
                    case 2:
                        notifyRef.current?.message("too many players on the server", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socket.disconnect();
                        break;
                    default:
                        notifyRef.current?.message("unkown error", "error", 2, () => {
                            SetDisabled(false);
                        });
                        socket.disconnect();

                        break;
                }
            });
        } catch (r) {
            notifyRef.current?.message(`Could not connect to peer ${addr}`, "error", 2, () => {
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
        const storedName = sessionStorage.getItem("current_name");
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
            sessionStorage.setItem("current_name", name);
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
                    sessionStorage.setItem("current_name", name);
                    
                    const virtualServer = new Server();
                    virtualServer.code = data.translatedCode; // RAW code
                    
                    const socket = await io(TranslateCode(virtualServer.code));
                    socket.on("state", (args: number) => {
                        switch (args) {
                            case 0:
                                SetSocket(socket);
                                SetSignedIn(true);
                                SetServer(virtualServer);
                                SetDisabled(false);
                                break;
                            default:
                                socket.disconnect();
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

    async function startButtonClicked(bots: botInitial[]) {
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
                    body: JSON.stringify({ playersCount: bots.length + 1 })
                });
                const data = await response.json();
                if (data.success) {
                    sessionStorage.setItem("current_room", data.hostCode);
                    sessionStorage.setItem("current_name", name);
                    
                    const virtualServer = new Server();
                    virtualServer.code = data.translatedCode; // RAW code
                    
                    const socket = await io(TranslateCode(virtualServer.code));
                    for (const x of bots) {
                        runBot(TranslateCode(virtualServer.code), x, Date.now().toString(36) + Math.random().toString(36).substring(2));
                    }
                    socket.on("state", (args: number) => {
                        switch (args) {
                            case 0:
                                SetSocket(socket);
                                SetSignedIn(true);
                                SetServer(virtualServer);
                                SetDisabled(false);

                                break;
                            case 1:
                                notifyRef.current?.message("the game has already begun", "error", 2, () => {
                                    SetDisabled(false);
                                });
                                socket.disconnect();
                                break;
                            case 2:
                                notifyRef.current?.message("too many players on the server", "error", 2, () => {
                                    SetDisabled(false);
                                });
                                socket.disconnect();
                                break;
                            default:
                                notifyRef.current?.message("unkown error", "error", 2, () => {
                                    SetDisabled(false);
                                });
                                socket.disconnect();

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
                                fbUser={fbUser}
                                joinBots={(x) => {
                                    startButtonClicked(x);
                                }}
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
