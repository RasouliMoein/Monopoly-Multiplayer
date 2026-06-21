import Slider from "./utils/slider";
import { useEffect, useState } from "react";
import { CookieManager } from "../utils/cookieManager";
import {
    MonopolyCookie,
    MonopolySettings,
    EngineSettings
} from "../../../shared/types/game";
export default function settingsNav() {
    const cookie = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)) as MonopolyCookie;
    const l: {
        gameEngine: [
            EngineSettings,
            React.Dispatch<React.SetStateAction<EngineSettings>>
        ];
        numbers: [number, React.Dispatch<React.SetStateAction<number>>][];
        booleans: [boolean, React.Dispatch<React.SetStateAction<boolean>>][];
    } = {
        gameEngine: useState<EngineSettings>("2d"),
        numbers: [
            useState<number>(
                cookie.settings ? cookie.settings.accessibility[0] : 45
            ),
            useState<number>(
                cookie.settings ? cookie.settings.accessibility[1] : 5
            ),
            useState<number>(cookie.settings ? cookie.settings.audio[0] : 100),
            useState<number>(cookie.settings ? cookie.settings.audio[1] : 100),
            useState<number>(cookie.settings ? cookie.settings.audio[2] : 5),
        ],
        booleans: [
            useState<boolean>(
                cookie.settings ? cookie.settings.accessibility[2] : false
            ),
            useState<boolean>(
                cookie.settings ? cookie.settings.accessibility[3] : false
            ),
            useState<boolean>(true),
            useState<boolean>(
                (cookie.settings && cookie.settings.notifications !== undefined)
                    ? cookie.settings.notifications
                    : true
            ),
            useState<boolean>(
                cookie.settings && cookie.settings.debugEnabled !== undefined
                    ? cookie.settings.debugEnabled
                    : false
            ),
        ],
    };

    useEffect(() => {
        const handleAuthFailed = () => {
            l.booleans[4][1](false);
        };
        window.addEventListener("debug_auth_failed_event", handleAuthFailed);
        return () => {
            window.removeEventListener("debug_auth_failed_event", handleAuthFailed);
        };
    }, []);

    useEffect(() => {
        const cookie = JSON.parse(decodeURIComponent(CookieManager.get("monopolySettings") as string)) as MonopolyCookie;
        const settings = {
            gameEngine: l.gameEngine[0],
            accessibility: [
                l.numbers[0][0],
                l.numbers[1][0],
                l.booleans[0][0],
                l.booleans[1][0],
                l.booleans[2][0],
            ],
            audio: [l.numbers[2][0], l.numbers[3][0], l.numbers[4][0]],
            notifications: l.booleans[3][0],
            debugEnabled: l.booleans[4][0],
        } as MonopolySettings;

        CookieManager.set("monopolySettings",encodeURIComponent( JSON.stringify({
            login: cookie.login,
            settings: settings,
        } as MonopolyCookie)))
    }, [
        l.gameEngine[0],
        ...l.numbers.map((v) => v[0]),
        ...l.booleans.map((v) => v[0]),
    ]);
    return (
        <div className="settings-container">
            <div className="settings-header">
                <h2 className="settings-title">System Settings</h2>
                <p className="settings-subtitle">Configure audio levels, rendering engine parameters, and game preferences.</p>
            </div>

            <div className="settings-grid">
                {/* CARD 1: Game Options */}
                <div className="settings-card">
                    <h3 className="card-subtitle">Game Options</h3>
                    
                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">Game Engine</span>
                            <span className="setting-desc">3D mode is currently in development</span>
                        </div>
                        <div className="select-container">
                            <select className="premium-select" defaultValue="2D">
                                <option value="2D">2D Engine</option>
                                <option value="3D">3D Engine (Beta)</option>
                            </select>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">Rotation Speed</span>
                            <span className="setting-desc">Adjust board rotation speed</span>
                        </div>
                        <div className="slider-wrapper">
                            <Slider
                                step={90 / 8}
                                min={0}
                                max={180}
                                defaultValue={l.numbers[0][0]}
                                onChange={(e) => {
                                    l.numbers[0][1](parseFloat(e.currentTarget.value));
                                }}
                                fixedNum={2}
                                suffix=" deg"
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">Scale Speed</span>
                            <span className="setting-desc">Adjust game zoom speed</span>
                        </div>
                        <div className="slider-wrapper">
                            <Slider
                                step={1}
                                min={1}
                                max={10}
                                defaultValue={l.numbers[1][0]}
                                onChange={(e) => {
                                    l.numbers[1][1](parseFloat(e.currentTarget.value));
                                }}
                                fixedNum={0}
                            />
                        </div>
                    </div>
                </div>

                {/* CARD 2: Audio Settings */}
                <div className="settings-card">
                    <h3 className="card-subtitle">Audio Settings</h3>

                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">Master Audio</span>
                            <span className="setting-desc">Overall master volume level</span>
                        </div>
                        <div className="slider-wrapper">
                            <Slider
                                step={1}
                                min={0}
                                max={100}
                                defaultValue={l.numbers[2][0]}
                                fixedNum={0}
                                suffix="%"
                                onChange={(e) => {
                                    l.numbers[2][1](parseFloat(e.currentTarget.value));
                                }}
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">SFX Audio</span>
                            <span className="setting-desc">Sound effects volume level</span>
                        </div>
                        <div className="slider-wrapper">
                            <Slider
                                step={1}
                                min={0}
                                max={100}
                                defaultValue={l.numbers[3][0]}
                                fixedNum={0}
                                suffix="%"
                                onChange={(e) => {
                                    l.numbers[3][1](parseFloat(e.currentTarget.value));
                                }}
                            />
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="setting-info">
                            <span className="setting-label">Music Audio</span>
                            <span className="setting-desc">Background music volume level</span>
                        </div>
                        <div className="slider-wrapper">
                            <Slider
                                step={1}
                                min={0}
                                max={100}
                                defaultValue={l.numbers[4][0]}
                                fixedNum={0}
                                suffix="%"
                                onChange={(e) => {
                                    l.numbers[4][1](parseFloat(e.currentTarget.value));
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* CARD 3: Preferences */}
                <div className="settings-card">
                    <h3 className="card-subtitle">Preferences</h3>

                    <div className="settings-row toggle-row">
                        <div className="setting-info">
                            <span className="setting-label">Show User IDs</span>
                            <span className="setting-desc">Display player reference IDs</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                defaultChecked={l.booleans[0][0]}
                                type="checkbox"
                                onChange={(e) => {
                                    l.booleans[0][1](e.currentTarget.checked);
                                }}
                            />
                            <span className="slider-round"></span>
                        </label>
                    </div>

                    <div className="settings-row toggle-row">
                        <div className="setting-info">
                            <span className="setting-label">Show Player Cursors</span>
                            <span className="setting-desc">Render mouse movements in real-time</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                defaultChecked={l.booleans[1][0]}
                                type="checkbox"
                                onChange={(e) => {
                                    l.booleans[1][1](e.currentTarget.checked);
                                }}
                            />
                            <span className="slider-round"></span>
                        </label>
                    </div>

                    <div className="settings-row toggle-row">
                        <div className="setting-info">
                            <span className="setting-label">Notify Balance Movements</span>
                            <span className="setting-desc">Alerts when cash amounts change</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                defaultChecked={l.booleans[3][0]}
                                type="checkbox"
                                onChange={(e) => {
                                    l.booleans[3][1](e.currentTarget.checked);
                                }}
                            />
                            <span className="slider-round"></span>
                        </label>
                    </div>

                    <div className="settings-row toggle-row">
                        <div className="setting-info">
                            <span className="setting-label">Enable Game Debugger</span>
                            <span className="setting-desc">Enables developer mode (Requires Password)</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                checked={l.booleans[4][0]}
                                type="checkbox"
                                onChange={async (e) => {
                                    const checked = e.currentTarget.checked;
                                    if (checked) {
                                        const pass = prompt("Enter Game Debugger Password:");
                                        if (pass === null) {
                                            l.booleans[4][1](false);
                                            return;
                                        }
                                        if (!pass) {
                                            alert("Password cannot be empty!");
                                            l.booleans[4][1](false);
                                            return;
                                        }
                                        sessionStorage.setItem("debug_password", pass);
                                        window.dispatchEvent(new CustomEvent("debug_toggle_auth", { detail: { password: pass } }));
                                        l.booleans[4][1](true);
                                    } else {
                                        sessionStorage.removeItem("debug_password");
                                        sessionStorage.removeItem("debug_unlocked");
                                        window.dispatchEvent(new CustomEvent("debug_toggle_auth", { detail: { password: null } }));
                                        l.booleans[4][1](false);
                                    }
                                }}
                            />
                            <span className="slider-round"></span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
