import { useState, useEffect } from "react";
import { User, botInitial, randomName } from "../../assets/types";
import BotsList from "./botsList";
import Slider from "../utils/slider";

export default function JoinScreen(props: {
    joinViaCode: () => void;
    joinBots: (x: Array<botInitial>) => void;
    createRoom: (playersCount: number) => void;
    fbUser: User | undefined;
    disabled: boolean;
    name: string;
    addr: string;
    SetAddress: React.Dispatch<React.SetStateAction<string>>;
    SetName: React.Dispatch<React.SetStateAction<string>>;
}) {
    const [tabIndex, SetTab] = useState(0);
    const [botsList, SetBotList] = useState<Array<botInitial>>([
        {
            name: randomName(),
            diff: "Regular",
        },
    ]);
    const [maxPlayers, setMaxPlayers] = useState(6);
    const [activeRooms, setActiveRooms] = useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchRooms = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch("/api/rooms");
            const data = await res.json();
            setActiveRooms(data);
        } catch (e) {
            console.error("Failed to fetch rooms:", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (tabIndex === 0) {
            fetchRooms();
        }
    }, [tabIndex]);

    return (
        <>
            <nav className="join">
                <button
                    data-tooltip-hover={"online"}
                    data-select={tabIndex === 0}
                    onClick={() => {
                        SetTab(0);
                    }}
                >
                    <img src="online.png" alt="" />
                </button>
                <button
                    data-tooltip-hover={"computer"}
                    data-select={tabIndex === 1}
                    onClick={() => {
                        SetTab(1);
                    }}
                >
                    <img src="bot.png" alt="" />
                </button>
            </nav>
            <br></br>

            {tabIndex === 1 ? (
                <>
                    <div key={"bots-name"}>
                        <p>please enter your name:</p>
                        {props.fbUser === undefined ? (
                            <input
                                type="text"
                                id="name"
                                onChange={(e) => {
                                    props.SetName(e.currentTarget.value);
                                }}
                                defaultValue={props.name}
                                placeholder="enter name"
                            />
                        ) : (
                            <input type="text" id="name" disabled={true} value={props.fbUser.name} placeholder="enter name" />
                        )}
                    </div>
                    <p>bots settings:</p>
                    <BotsList
                        OnChange={(arr: botInitial[]) => {
                            SetBotList(arr);
                        }}
                    />

                    <center>
                        <button
                            onClick={() => {
                                props.joinBots(botsList);
                            }}
                            disabled={props.disabled}
                        >
                            start
                        </button>
                    </center>
                </>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '24px',
                    justifyContent: 'space-between',
                    minWidth: '700px',
                    maxWidth: '850px',
                    color: 'white',
                    fontFamily: 'system-ui, sans-serif',
                    marginTop: '5px'
                }}>
                    {/* Left: Configuration Form */}
                    <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div key={"online-name"} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <p style={{ margin: 0, opacity: 0.8, fontSize: '13px', textAlign: 'left' }}>Your Name:</p>
                            {props.fbUser === undefined ? (
                                <input
                                    type="text"
                                    id="name"
                                    onChange={(e) => {
                                        props.SetName(e.currentTarget.value);
                                    }}
                                    defaultValue={props.name}
                                    placeholder="Enter username"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        color: 'white',
                                        fontSize: '14px',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        marginBottom: '5px'
                                    }}
                                />
                            ) : (
                                <input 
                                    type="text" 
                                    id="name" 
                                    disabled={true} 
                                    value={props.fbUser.name} 
                                    placeholder="Enter username"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                        color: '#888',
                                        fontSize: '14px',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        marginBottom: '5px'
                                    }}
                                />
                            )}
                        </div>

                        {/* Create Lobby Card */}
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0075ff', textAlign: 'left' }}>Create New Lobby</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8, fontSize: '12px' }}>
                                    <span>Max Players:</span>
                                    <span>{maxPlayers}</span>
                                </div>
                                <Slider
                                    onChange={(e) => {
                                        setMaxPlayers(parseInt(e.currentTarget.value));
                                    }}
                                    max={6}
                                    min={2}
                                    defaultValue={maxPlayers}
                                    step={1}
                                />
                            </div>
                            <button
                                onClick={() => props.createRoom(maxPlayers)}
                                disabled={props.disabled}
                                style={{
                                    padding: '8px',
                                    fontSize: '14px',
                                    borderRadius: '6px',
                                    backgroundColor: '#0075ff',
                                    border: 'none',
                                    color: 'white',
                                    fontWeight: '600',
                                    cursor: props.disabled ? 'wait' : 'pointer',
                                    transition: 'background-color 0.2s',
                                    width: '100%',
                                    marginTop: '2px'
                                }}
                            >
                                Create & Host Game
                            </button>
                        </div>

                        {/* Join with Code Card */}
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#50c878', textAlign: 'left' }}>Join Lobby with Code</h4>
                            <input
                                type="text"
                                id="room-code"
                                onChange={(e) => props.SetAddress(e.currentTarget.value.toUpperCase())}
                                value={props.addr}
                                placeholder="ENTER 6-CHAR CODE"
                                style={{
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    color: 'white',
                                    fontSize: '14px',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    textAlign: 'center',
                                    fontFamily: 'consolas, monospace',
                                    letterSpacing: '2px',
                                    marginBottom: '5px'
                                }}
                            />
                            <button
                                onClick={props.joinViaCode}
                                disabled={props.disabled}
                                style={{
                                    padding: '8px',
                                    fontSize: '14px',
                                    borderRadius: '6px',
                                    backgroundColor: '#50c878',
                                    border: 'none',
                                    color: 'white',
                                    fontWeight: '600',
                                    cursor: props.disabled ? 'wait' : 'pointer',
                                    transition: 'background-color 0.2s',
                                    width: '100%'
                                }}
                            >
                                Join Room
                            </button>
                        </div>
                    </div>

                    {/* Right: Active Public Lobbies Panel */}
                    <div style={{
                        flex: '1.2',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '14px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        maxHeight: '345px',
                        overflowY: 'auto',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Active Public Rooms</h4>
                            <button 
                                onClick={fetchRooms}
                                disabled={isRefreshing}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#0075ff',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    padding: '3px',
                                    opacity: isRefreshing ? 0.5 : 1
                                }}
                            >
                                {isRefreshing ? "Refreshing..." : "Refresh ↻"}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {activeRooms.length === 0 ? (
                                <div style={{ 
                                    padding: '24px 10px', 
                                    textAlign: 'center', 
                                    opacity: 0.5, 
                                    fontSize: '12px',
                                    border: '1px dashed rgba(255,255,255,0.1)',
                                    borderRadius: '6px'
                                }}>
                                    No public lobbies available.<br/>Host a new room!
                                </div>
                            ) : (
                                activeRooms.map((room) => {
                                    const isJoinable = !room.gameStarted && room.clientsCount < room.maxPlayers;
                                    return (
                                        <div 
                                            key={room.translatedCode}
                                            onClick={() => {
                                                if (isJoinable) {
                                                    props.SetAddress(room.code);
                                                    setTimeout(() => {
                                                        props.joinViaCode();
                                                    }, 100);
                                                }
                                            }}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                background: isJoinable ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: isJoinable ? 'pointer' : 'not-allowed',
                                                transition: 'transform 0.2s, background-color 0.2s',
                                                transform: isJoinable ? 'scale(1)' : 'none',
                                                opacity: isJoinable ? 1 : 0.6
                                            }}
                                            onMouseEnter={(e) => {
                                                if (isJoinable) {
                                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                                    e.currentTarget.style.transform = 'scale(1.01)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (isJoinable) {
                                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'consolas, monospace', letterSpacing: '1px' }}>
                                                        {room.code}
                                                    </span>
                                                    <span style={{ 
                                                        fontSize: '9px', 
                                                        padding: '1px 4px', 
                                                        borderRadius: '3px',
                                                        backgroundColor: room.gameStarted ? 'rgba(255, 193, 7, 0.15)' : 'rgba(76, 175, 80, 0.15)',
                                                        color: room.gameStarted ? '#ffc107' : '#4caf50'
                                                    }}>
                                                        {room.gameStarted ? "In-Game" : "Lobby"}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '11px', opacity: 0.6 }}>
                                                    Host: 👑 {room.hostName}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                <span style={{ fontSize: '12px', opacity: 0.8 }}>
                                                    👥 {room.clientsCount}/{room.maxPlayers}
                                                </span>
                                                {isJoinable && (
                                                    <span style={{ fontSize: '10px', color: '#0075ff', fontWeight: '600' }}>
                                                        Join →
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
