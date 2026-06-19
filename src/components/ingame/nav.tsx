import PlayersIcon from "../../../public/players.png";
import ChatIcon from "../../../public/chat.png";
import LeaveIcon from "../../../public/leave1.png";
import PropretiesIcon from "../../../public/proprety.png";
import SettingsIcon from "../../../public/settings.png";
import MonopolyIcon from "../../../public/icon.png";

import { forwardRef, useState, useImperativeHandle, useEffect, useRef } from "react";
import { Player } from "../../utils/player.ts";
import { Server, Socket } from "../../utils/sockets.ts";
import PropertyTab, { PropertyTabRef } from "./propertyTab.tsx";
import PlayersTab, { PlayersTabRef } from "./playersTab.tsx";
import SettingsNav from "../settingsNav.tsx";
import { MonopolyMode, historyAction } from "../../types/index.ts";

interface MonopolyNavProps {
    name: string;
    socket: Socket;
    players: Array<Player>;
    currentTurn: string;
    server: Server | undefined;
    callServer: () => void;
    onLeave: () => void;
    Morgage: {
        onMort: (a: number, prpName: string) => void;
        onCanc: (a: number, prpName: string) => void;
    };
    history: Array<historyAction>;
    time: Date;
    selectedMode: MonopolyMode;
    hostId: string;
    bankHouses?: number;
    bankHotels?: number;
}

export interface MonopolyNavRef {
    addMessage: (arg: { from: string; message: string }) => void;
    reRenderPlayerList: () => void;
    clickedOnBoard: (a: number) => void;
}

const MonopolyNav = forwardRef<MonopolyNavRef, MonopolyNavProps>((prop, ref) => {
    const [tabIndex, SetTab] = useState<number>(0);
    const [messages, SetMessages] = useState<Array<{ from: string; message: string }>>([]);
    const [displayPlayers, SetDisplays] = useState<Array<Player>>(prop.players);
    
    // Premium Chat alert and micro-animation state variables
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [shouldShake, setShouldShake] = useState<boolean>(false);
    const [chatToast, setChatToast] = useState<{ from: string; message: string; color: string; icon: number } | null>(null);

    function reRenderPlayerList() {
        SetDisplays(prop.players);
    }

    // Reset unread count when clicking on chat tab
    useEffect(() => {
        if (tabIndex === 2) {
            setUnreadCount(0);
        }
    }, [tabIndex]);

    useImperativeHandle(ref, () => ({
        addMessage(arg) {
            SetMessages((old) => [...old, arg]);
            if (tabIndex !== 2) {
                setUnreadCount((old) => old + 1);
                setShouldShake(true);
                setTimeout(() => setShouldShake(false), 500);

                const sender = prop.players.find(p => p.username === arg.from);
                const senderColor = sender ? sender.color : "#64748b";
                const senderIcon = sender ? sender.icon : 0;
                setChatToast({ from: arg.from, message: arg.message, color: senderColor, icon: senderIcon });

                setTimeout(() => {
                    setChatToast(prev => prev && prev.message === arg.message && prev.from === arg.from ? null : prev);
                }, 4000);
            }
        },
        reRenderPlayerList,
        clickedOnBoard: (a) => {
            SetTab(1);
            requestAnimationFrame(() => {
                propertyRef.current?.clickedOnBoard(a);
            });
        },
    }));

    const propertyRef = useRef<PropertyTabRef>(null);
    const playersRef = useRef<PlayersTabRef>(null);

    useEffect(reRenderPlayerList, [prop.players.map((v) => v.properties), prop.players.map((v) => v.balance)]);

    useEffect(() => {
        const keyDownHandle = (e: KeyboardEvent) => {
            const x = parseInt(e.key);
            if (!isNaN(x)) {
                const activeElement = document.activeElement;
                if (activeElement === null) {
                    if (x >= 1 && x <= 3) SetTab(x - 1);
                    else if (x === 4) SetTab(4);
                } else if (activeElement.tagName !== "INPUT") {
                    if (x >= 1 && x <= 3) SetTab(x - 1);
                    else if (x === 4) SetTab(4);
                }
            }
        };
        document.addEventListener("keydown", keyDownHandle);
        return () => {
            document.removeEventListener("keydown", keyDownHandle);
        };
    }, []);

    return (
        <nav className="main">
            {/* Sliding Toast popup card overlay */}
            {chatToast && (
                <div className="chat-toast-popup">
                    <div className="chat-toast-header">
                        <div className="chat-toast-avatar" style={{ backgroundColor: chatToast.color }}>
                            <img src={`./p${chatToast.icon + 1}.png`} alt="" />
                        </div>
                        <span className="chat-toast-sender">{chatToast.from}</span>
                    </div>
                    <div className="chat-toast-body">{chatToast.message}</div>
                </div>
            )}

            <nav className="header">
                <img style={{ marginTop: 75 }} className="header" src={MonopolyIcon.replace("public/", "")} />
                <div className="upper">
                    <div
                        key={"ingame-nav-header-0"}
                        data-selected={tabIndex == 0}
                        onClick={() => SetTab(0)}
                        data-tooltip-hover="players"
                        className="button"
                    >
                        <img src={PlayersIcon.replace("public/", "")} alt="" />
                    </div>

                    <div
                        key={"ingame-nav-header-1"}
                        data-selected={tabIndex == 1}
                        onClick={() => SetTab(1)}
                        data-tooltip-hover="propreties"
                        className="button"
                    >
                        <img src={PropretiesIcon.replace("public/", "")} alt="" />
                    </div>

                    <div
                        key={"ingame-nav-header-2"}
                        data-selected={tabIndex == 2}
                        onClick={() => SetTab(2)}
                        data-tooltip-hover="chat"
                        className={`button ${shouldShake ? "shake-anim" : ""}`}
                        id="chatIconChange"
                        style={{ position: "relative" }}
                    >
                        <img src={ChatIcon.replace("public/", "")} alt="" />
                        {unreadCount > 0 && (
                            <span className="chat-badge">{unreadCount}</span>
                        )}
                    </div>
                </div>
                <div className="lower">
                    {prop.server !== undefined ? (
                        <div
                            key={"ingame-nav-header-server"}
                            data-selected={false}
                            onClick={() => prop.callServer()}
                            data-tooltip-hover="server"
                            className="button"
                        >
                            <img src="server.png" alt="" />
                        </div>
                    ) : (
                        <></>
                    )}
                    <div
                        key={"ingame-nav-header-4"}
                        data-selected={tabIndex == 4}
                        onClick={() => SetTab(4)}
                        data-tooltip-hover="monopolySettings"
                        className="button"
                    >
                        <img src={SettingsIcon.replace("public/", "")} alt="" />
                    </div>
                    <div
                        key={"ingame-nav-header-7"}
                        data-tooltip="leave"
                        className="button color"
                        data-tooltip-hover="leave"
                        onClick={() => {
                            prop.onLeave();
                        }}
                    >
                        <img src={LeaveIcon.replace("public/", "")} alt="" />
                    </div>
                </div>
            </nav>

            <nav className="content" data-index={tabIndex > 4 ? 0 : tabIndex < 0 ? 0 : tabIndex}>
                {tabIndex == 1 ? (
                    <PropertyTab
                        ref={propertyRef}
                        players={displayPlayers}
                        socket={prop.socket}
                        Morgage={prop.Morgage}
                        allowMortgage={prop.selectedMode.mortageAllowed}
                        myTurn={prop.currentTurn === prop.socket.id}
                        bankHouses={prop.bankHouses}
                    />
                ) : tabIndex == 2 ? (
                    <>
                        <h3 style={{ textAlign: "center" }}>Chat</h3>
                        <div className="main-chat">
                            <div className="messages">
                                {messages.map((v, i) => (
                                    <div key={i} className="message">
                                        <p>{v.from}:</p>
                                        <p>{v.message}</p>
                                    </div>
                                ))}
                            </div>
                            <input
                                placeholder="Type Message Here..."
                                type="text"
                                onKeyDown={(e) => {
                                    if (e.which === 13 && e.currentTarget.value.length > 0) {
                                        const message = e.currentTarget.value;
                                        prop.socket.emit("message", message);
                                        e.currentTarget.value = "";
                                    }
                                }}
                            />
                        </div>
                    </>
                ) : tabIndex == 4 ? (
                    <SettingsNav />
                ) : (
                    <PlayersTab
                        ref={playersRef}
                        clickedOnPlayer={(position) => {
                            SetTab(1);
                            requestAnimationFrame(() => {
                                propertyRef.current?.clickedOnBoard(position);
                            });
                        }}
                        players={displayPlayers}
                        socket={prop.socket}
                        currentTurn={prop.currentTurn}
                        hostId={prop.hostId}
                        bankHouses={prop.bankHouses}
                        bankHotels={prop.bankHotels}
                        history={prop.history}
                        time={prop.time}
                        selectedMode={prop.selectedMode}
                    />
                )}
            </nav>
        </nav>
    );
});

export default MonopolyNav;
