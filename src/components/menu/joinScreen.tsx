import { useState, useEffect } from "react";
import { User, botInitial } from "../../assets/types";
import { Icons } from "../../assets/icons";

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
    const [maxPlayers, setMaxPlayers] = useState(4);
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
        fetchRooms();
    }, []);

    return (
        <div className="join-screen-container">
            <div className="two-column-layout">
                {/* LEFT COLUMN: Lobbies list */}
                <div className="left-column">
                    <div className="lobbies-board-card">
                        <div className="board-header">
                            <div style={{ textAlign: "left" }}>
                                <h3 className="section-title">Active Public Rooms</h3>
                                <p className="section-subtitle">Join an ongoing public lobby or quickly connect with friends.</p>
                            </div>
                            <button 
                                onClick={fetchRooms}
                                disabled={isRefreshing}
                                className="refresh-btn"
                            >
                                {isRefreshing ? "Refreshing..." : "Refresh Lobbies ↻"}
                            </button>
                        </div>

                        <div className="lobbies-scroll-list">
                            {activeRooms.length === 0 ? (
                                <div className="no-lobbies-fallback">
                                    <div className="fallback-icon" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}><Icons.Antenna width={24} height={24} style={{ opacity:0.4 }} /></div>
                                    <p>No active public lobbies found.</p>
                                    <span>Be the first to host a multiplayer room!</span>
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
                                            className={`lobby-row-item ${isJoinable ? 'joinable' : 'full'}`}
                                        >
                                            <div className="lobby-row-left">
                                                <span className="room-code-tag">{room.code}</span>
                                                <span className={`room-status-badge ${room.gameStarted ? 'in-game' : 'waiting'}`}>
                                                    {room.gameStarted ? "In-Game" : "Lobby"}
                                                </span>
                                            </div>
                                            <div className="lobby-row-middle">
                                                <span className="host-name-label"><Icons.Crown width={12} height={12} style={{verticalAlign:'middle', marginRight:3}} />{room.hostName}</span>
                                            </div>
                                            <div className="lobby-row-right">
                                                <span className="player-count-label"><Icons.Users width={12} height={12} style={{verticalAlign:'middle', marginRight:3}} />{room.clientsCount}/{room.maxPlayers}</span>
                                                {isJoinable && <span className="join-arrow-btn">Join →</span>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* BOTTOM BAR: Join Game Only */}
                    <div className="search-bar-horizontal" style={{ gridTemplateColumns: '1.8fr 1fr' }}>
                        <div className="search-pill-input code-pill" style={{ width: '100%' }}>
                            <input
                                type="text"
                                id="room-code"
                                onChange={(e) => props.SetAddress(e.currentTarget.value.toUpperCase())}
                                value={props.addr}
                                placeholder="Enter Lobby Code"
                                maxLength={8}
                                className="pill-text-field"
                                style={{ width: '100%' }}
                            />
                            <span className="pill-icon"><Icons.MapPin width={12} height={12} /></span>
                        </div>
                        <button
                            onClick={props.joinViaCode}
                            disabled={props.disabled || !props.addr || !props.name}
                            className="primary-action-btn"
                            style={{ height: '40px', padding: '0 10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Icons.Zap width={14} height={14} style={{flexShrink:0}} /> Join Lobby
                        </button>
                    </div>
                </div>

                {/* RIGHT COLUMN: Host New Game Card */}
                <div className="right-column">
                    <div className="profile-details-card">
                        <div className="card-header-bar">
                            <h3 className="card-title">Host New Game</h3>
                        </div>

                        {/* Max Players Selection (Moved from bottom left) */}
                        <div className="input-group-bordered">
                            <label className="input-label">MAX PLAYERS LIMIT</label>
                            <div className="select-container" style={{ width: '100%' }}>
                                <select
                                    value={maxPlayers}
                                    onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                                    className="premium-select"
                                    style={{ width: '100%', height: '40px', fontSize: '14px' }}
                                >
                                    <option value={2}>2 Players Max</option>
                                    <option value={3}>3 Players Max</option>
                                    <option value={4}>4 Players Max</option>
                                    <option value={5}>5 Players Max</option>
                                    <option value={6}>6 Players Max</option>
                                </select>
                            </div>
                        </div>

                        {/* Big Premium Action Button (Moved from bottom left) */}
                        <div className="action-button-container">
                            <button
                                onClick={() => props.createRoom(maxPlayers)}
                                disabled={props.disabled || !props.name}
                                className="primary-action-btn"
                            >
                                {props.name.trim() ? "Host & Play Game" : "Enter Name in Header"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
