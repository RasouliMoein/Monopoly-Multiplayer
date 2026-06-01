import PlayersIcon from "../../../public/players.png";
import ChatIcon from "../../../public/chat.png";
import NChatIcon from "../../../public/chat_new.png";
import LeaveIcon from "../../../public/leave1.png";
import PropretiesIcon from "../../../public/proprety.png";
import SettingsIcon from "../../../public/settings.png";
import MonopolyIcon from "../../../public/icon.png";

import { forwardRef, useState, useImperativeHandle, useEffect, useRef } from "react";
import { Player } from "../../assets/player.ts";
import { Server, Socket } from "../../assets/sockets.ts";
import PropretyTab, { PropretyTabRef } from "./propretyTab.tsx";
import PlayersTab, { PlayersTabRef } from "./playersTab.tsx";
import SettingsNav from "../settingsNav.tsx";
import { MonopolyMode, historyAction } from "../../assets/types.ts";
import monopolyJSON from "../../assets/monopoly.json";

const PROPERTY_COLORS = new Map<string, string>(
    monopolyJSON.properties.map(p => {
        const group = p.group || "Special";
        const colors: Record<string, string> = {
            "purple": "#8e44ad",
            "lightgreen": "#2ecc71",
            "violet": "#e040fb",
            "orange": "#e67e22",
            "red": "#e74c3c",
            "yellow": "#f1c40f",
            "darkgreen": "#27ae60",
            "darkblue": "#2980b9",
            "utilities": "#7f8c8d",
            "railroad": "#34495e",
        };
        const c = colors[group.toLowerCase()] || "#7f8c8d";
        return [p.name, c];
    })
);

interface ParsedHistory {
    type: string;
    emoji: string;
    player: string;
    details: string;
    amount?: string;
    details2?: string;
    targetPlayer?: string;
    target?: string;
    cardText?: string;
    bgClass: string;
}

function parseHistoryAction(action: string): ParsedHistory {
    const text = action.trim();
    
    // 1. Roll: "chrome rolled [6, 5] moving to "St. Charles Place""
    if (text.includes("rolled [") && text.includes("] moving to")) {
        const rollMatch = text.match(/(.*?) rolled \[(.*?)] moving to "(.*?)"/);
        if (rollMatch) {
            return {
                type: "roll",
                emoji: "🎲",
                player: rollMatch[1],
                details: `rolled [${rollMatch[2]}] and moved to `,
                target: rollMatch[3],
                bgClass: "hist-roll",
            };
        }
    }
    
    // Escaped jail with doubles: "chrome rolled doubles [d1, d2] and escaped Jail!"
    if (text.includes("rolled doubles [") && text.includes("escaped Jail")) {
        const escMatch = text.match(/(.*?) rolled doubles \[(.*?)] and escaped Jail!/);
        if (escMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: escMatch[1],
                details: `rolled doubles [${escMatch[2]}] and escaped Jail! 🏃‍♂️`,
                bgClass: "hist-unjail",
            };
        }
    }
    
    // Failed doubles in jail: "chrome failed doubles roll and stayed in Jail"
    if (text.includes("failed doubles roll and stayed in Jail")) {
        const stayMatch = text.match(/(.*?) failed doubles roll and stayed in Jail/);
        if (stayMatch) {
            return {
                type: "jail",
                emoji: "⛓️",
                player: stayMatch[1],
                details: "failed doubles roll and stayed in Jail 🔒",
                bgClass: "hist-jail-stay",
            };
        }
    }
    
    // 2. Buy: "edge bought St. Charles Place"
    if (text.includes(" bought ")) {
        const buyMatch = text.match(/(.*?) bought (.*)/);
        if (buyMatch) {
            return {
                type: "buy",
                emoji: "🏠",
                player: buyMatch[1],
                details: "bought ",
                target: buyMatch[2],
                bgClass: "hist-buy",
            };
        }
    }
    
    // 3. Upgrade: "edge upgraded St. Charles Place"
    if (text.includes(" upgraded ")) {
        const upgradeMatch = text.match(/(.*?) upgraded (.*)/);
        if (upgradeMatch) {
            return {
                type: "upgrade",
                emoji: "🏘️",
                player: upgradeMatch[1],
                details: "upgraded ",
                target: upgradeMatch[2],
                bgClass: "hist-upgrade",
            };
        }
    }
    
    // 4. Rent: "edge paid $26 rent to chrome"
    if (text.includes(" paid $") && text.includes(" rent to ")) {
        const rentMatch = text.match(/(.*?) paid \$(.*?) rent to (.*)/);
        if (rentMatch) {
            return {
                type: "rent",
                emoji: "💸",
                player: rentMatch[1],
                details: `paid `,
                amount: `$${rentMatch[2]} rent`,
                details2: ` to `,
                targetPlayer: rentMatch[3],
                bgClass: "hist-rent",
            };
        }
    }
    
    // 5. Tax: "chrome paid $200 Income Tax" or "chrome paid $100 Luxury Tax"
    if (text.includes(" paid $") && text.toLowerCase().includes("tax")) {
        const taxMatch = text.match(/(.*?) paid \$(.*?) (Income Tax|Luxury Tax)/i);
        if (taxMatch) {
            return {
                type: "tax",
                emoji: "🏛️",
                player: taxMatch[1],
                details: `paid `,
                amount: `$${taxMatch[2]}`,
                details2: ` to ${taxMatch[3]}`,
                bgClass: "hist-tax",
            };
        }
    }
    
    // 6. Jail: "chrome goes to jail"
    if (text.includes(" goes to jail")) {
        const jailMatch = text.match(/(.*?) goes to jail/);
        if (jailMatch) {
            return {
                type: "jail",
                emoji: "👮",
                player: jailMatch[1],
                details: "was sent to Jail! 🚔",
                bgClass: "hist-jail",
            };
        }
    }
    
    // 7. Unjail pay: "chrome paid $50 to leave jail"
    if (text.includes(" paid $50 to leave jail")) {
        const unjailMatch = text.match(/(.*?) paid \$50 to leave jail/);
        if (unjailMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: unjailMatch[1],
                details: "paid $50 and left Jail 🔓",
                bgClass: "hist-unjail",
            };
        }
    }
    
    // Unjail card: "chrome used a Get Out of Jail Free card to leave jail"
    if (text.includes("used a Get Out of Jail Free card to leave jail")) {
        const cardUnjailMatch = text.match(/(.*?) used a Get Out of Jail Free card to leave jail/);
        if (cardUnjailMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: cardUnjailMatch[1],
                details: "used a Get Out of Jail Free card to escape Jail 🕊️",
                bgClass: "hist-unjail",
            };
        }
    }
    
    // 8. Mortgage: unmortgage / mortgage
    if (text.includes("mortgage")) {
        if (text.includes("cancel the mortgage on")) {
            const match = text.match(/(.*?) paid \$(.*?) to cancel the mortgage on (.*)/);
            if (match) {
                return {
                    type: "unmortgage",
                    emoji: "🔓",
                    player: match[1],
                    details: "unmortgaged ",
                    target: match[3],
                    amount: ` for $${match[2]}`,
                    bgClass: "hist-unmortgage",
                };
            }
        } else if (text.includes("paid $") && text.includes(" to mortgage ")) {
            const match = text.match(/(.*?) paid \$(.*?) to mortgage (.*)/);
            if (match) {
                return {
                    type: "mortgage",
                    emoji: "💰",
                    player: match[1],
                    details: "mortgaged ",
                    target: match[3],
                    amount: ` for $${match[2]}`,
                    bgClass: "hist-mortgage",
                };
            }
        }
        
        // Also check nicer direct strings
        const mortgagedMatch = text.match(/(.*?) mortgaged (.*?) for \$(.*)/);
        if (mortgagedMatch) {
            return {
                type: "mortgage",
                emoji: "💰",
                player: mortgagedMatch[1],
                details: "mortgaged ",
                target: mortgagedMatch[2],
                amount: ` for $${mortgagedMatch[3]}`,
                bgClass: "hist-mortgage",
            };
        }
        
        const unmortgagedMatch = text.match(/(.*?) unmortgaged (.*?) for \$(.*)/);
        if (unmortgagedMatch) {
            return {
                type: "unmortgage",
                emoji: "🔓",
                player: unmortgagedMatch[1],
                details: "unmortgaged ",
                target: unmortgagedMatch[2],
                amount: ` for $${unmortgagedMatch[3]}`,
                bgClass: "hist-unmortgage",
            };
        }
    }
    
    // 9. Card drew: Chance or Community Chest
    if (text.includes(" drew Chance:") || text.includes(" drew Community Chest:")) {
        const cardMatch = text.match(/(.*?) drew (Chance|Community Chest): "(.*?)"/);
        if (cardMatch) {
            const isChance = cardMatch[2] === "Chance";
            return {
                type: isChance ? "chance" : "chest",
                emoji: isChance ? "❓" : "📦",
                player: cardMatch[1],
                details: `drew a ${cardMatch[2]} card: `,
                cardText: `"${cardMatch[3]}"`,
                bgClass: isChance ? "hist-chance" : "hist-chest",
            };
        }
    }
    
    // 10. Pass Go: "chrome passed Go and collected $200"
    if (text.includes("passed Go and collected")) {
        const goMatch = text.match(/(.*?) passed Go and collected \$(.*)/);
        if (goMatch) {
            return {
                type: "go",
                emoji: "🏁",
                player: goMatch[1],
                details: "passed Go and collected ",
                amount: `$${goMatch[2]} 💵`,
                bgClass: "hist-go",
            };
        }
    }
    
    // 11. Trade: "chrome done a trade with edge"
    if (text.includes(" done a trade with ")) {
        const tradeMatch = text.match(/(.*?) done a trade with (.*)/);
        if (tradeMatch) {
            return {
                type: "trade",
                emoji: "🤝",
                player: tradeMatch[1],
                details: "completed a deal with ",
                targetPlayer: tradeMatch[2],
                bgClass: "hist-trade",
            };
        }
    }
    
    // Default fallback
    return {
        type: "event",
        emoji: "📝",
        player: "",
        details: text,
        bgClass: "hist-default",
    };
}


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
}
export interface MonopolyNavRef {
    addMessage: (arg: { from: string; message: string }) => void;
    reRenderPlayerList: () => void;
    clickedOnBoard: (a: number) => void;
}

const MonopolyNav = forwardRef<MonopolyNavRef, MonopolyNavProps>((prop, ref) => {
    const [tabIndex, SetTab] = useState<number>(0);
    const [messages, SetMessages] = useState<Array<{ from: string; message: string }>>([]);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    function reRenderPlayerList() {
        SetDisplays(prop.players);
    }

    useEffect(() => {
        const t_interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => {
            clearInterval(t_interval);
        };
    }, [prop.time]);
    function getTimeString(s: string) {
        const _d = new Date(s);
        const hours = _d.getHours().toString().padStart(2, "0"); // Get hours and pad with leading zero if necessary
        const minutes = _d.getMinutes().toString().padStart(2, "0"); // Get minutes and pad with leading zero if necessary
        return `${hours}:${minutes}`;
    }
    function calculateTimeDifference(a: Date, b: Date) {
        // Parse the input date strings into Date objects
        const startTime = a.getTime();
        const endTime = b.getTime();

        // Calculate the time difference in milliseconds
        const timeDifference = endTime - startTime;

        // Calculate hours, minutes, and seconds
        const hours = Math.floor(timeDifference / 3600000); // 1 hour = 3600000 milliseconds
        const minutes = Math.floor((timeDifference % 3600000) / 60000); // 1 minute = 60000 milliseconds
        const seconds = Math.floor((timeDifference % 60000) / 1000); // 1 second = 1000 milliseconds

        const h = hours.toString().padStart(2, "0");
        const m = minutes.toString().padStart(2, "0");
        const s = seconds.toString().padStart(2, "0");
        // Format the output string based on whether there are hours
        if (hours === 0) {
            return `${m}:${s}`;
        } else {
            return `${h}:${m}:${s}`;
        }
    }
    const [displayPlayers, SetDisplays] = useState<Array<Player>>(prop.players);
    useImperativeHandle(ref, () => ({
        addMessage(arg) {
            SetMessages((old) => [...old, arg]);
            if (tabIndex !== 2) {
                const iconElement = document.getElementById("chatIconChange") as HTMLDivElement;
                const imageElement = iconElement.querySelector("img") as HTMLImageElement;
                imageElement.style.animation = "spin3 2s cubic-bezier(.68,.05,.49,.95) infinite";
                imageElement.src = NChatIcon.replace("/public", "");
                iconElement.onclick = () => {
                    imageElement.src = ChatIcon.replace("/public", "");
                    imageElement.style.animation = "";
                    SetTab(2);
                    iconElement.onclick = () => {
                        SetTab(2);
                    };
                };
            }
        },
        reRenderPlayerList,
        clickedOnBoard: (a) => {
            SetTab(1);
            requestAnimationFrame(() => {
                propretyRef.current?.clickedOnBoard(a);
            });
        },
    }));

    const propretyRef = useRef<PropretyTabRef>(null);
    const playersRef = useRef<PlayersTabRef>(null);

    useEffect(reRenderPlayerList, [prop.players.map((v) => v.properties), prop.players.map((v) => v.balance)]);

    useEffect(() => {
        const keyDownHandle = (e: KeyboardEvent) => {
            const x = parseInt(e.key);
            if (!isNaN(x)) {
                const activeElement = document.activeElement;
                if (activeElement === null) SetTab(x - 1);
                else if (activeElement.tagName !== "INPUT") {
                    SetTab(x - 1);
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
                        className="button"
                        id="chatIconChange"
                    >
                        <img src={ChatIcon.replace("public/", "")} alt="" />
                    </div>
                    <div
                        key={"ingame-nav-header-3"}
                        data-selected={tabIndex === 3}
                        onClick={() => {
                            SetTab(3);
                        }}
                        data-tooltip-hover="history"
                        className="button"
                    >
                        <img src="history.png" alt="" />
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
                    <PropretyTab
                        ref={propretyRef}
                        players={displayPlayers}
                        socket={prop.socket}
                        Morgage={prop.Morgage}
                        allowMortgage={prop.selectedMode.mortageAllowed}
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
                                        //send the message
                                        const message = e.currentTarget.value;

                                        prop.socket.emit("message", message);
                                        e.currentTarget.value = "";
                                    }
                                }}
                            />
                        </div>
                    </>
                ) : tabIndex == 3 ? (
                    <>
                        <h3 style={{ textAlign: "center" }}>
                            History <h2>{calculateTimeDifference(prop.time, currentTime)}</h2>
                        </h3>

                        <div className="history-list">
                                {[...prop.history]
                                    .sort((a, b) => {
                                        return new Date(b.time).getTime() - new Date(a.time).getTime();
                                    })
                                    .map((v, i) => {
                                        const parsed = parseHistoryAction(v.action);
                                        
                                        const getPlayerColor = (username: string) => {
                                            const p = prop.players.find(pl => pl.username === username);
                                            return p ? p.color : "#38bdf8";
                                        };
                                        
                                        const playerColor = getPlayerColor(parsed.player);
                                        const targetColor = parsed.target ? PROPERTY_COLORS.get(parsed.target) : undefined;
                                        const targetPlayerColor = parsed.targetPlayer ? getPlayerColor(parsed.targetPlayer) : undefined;
                                        
                                        return (
                                            <div className={`history-action ${parsed.bgClass}`} key={`${v.time}-${i}`}>
                                                <div className="history-action-header">
                                                    <div className="history-action-type">
                                                        <span>{parsed.emoji}</span>
                                                        <span>{parsed.type}</span>
                                                    </div>
                                                    <div className="history-action-time">{getTimeString(v.time)}</div>
                                                </div>
                                                <div className="history-action-body">
                                                    {parsed.player && (
                                                        <span className="history-player" style={{ color: playerColor || "#fff" }}>
                                                            {parsed.player}
                                                        </span>
                                                    )}
                                                    <span>{parsed.details}</span>
                                                    {parsed.amount && (
                                                        <span className="history-amount">
                                                            {parsed.amount}
                                                        </span>
                                                    )}
                                                    {parsed.details2 && <span>{parsed.details2}</span>}
                                                    {parsed.targetPlayer && (
                                                        <span className="history-player" style={{ color: targetPlayerColor || "#fff" }}>
                                                            {parsed.targetPlayer}
                                                        </span>
                                                    )}
                                                    {parsed.target && (
                                                        <span 
                                                            className="history-target" 
                                                            style={{ 
                                                                color: targetColor || "#fff",
                                                                borderBottom: `2px solid ${targetColor || "rgba(255,255,255,0.2)"}`
                                                            }}
                                                        >
                                                            {parsed.target}
                                                        </span>
                                                    )}
                                                    {parsed.cardText && (
                                                        <span className="history-card-text">
                                                            {parsed.cardText}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                propretyRef.current?.clickedOnBoard(position);
                            });
                        }}
                        players={displayPlayers}
                        socket={prop.socket}
                        currentTurn={prop.currentTurn}
                    />
                )}
            </nav>
        </nav>
    );
});
export default MonopolyNav;
