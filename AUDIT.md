# Monopoly Multiplayer Codebase Audit Report (AUDIT.md)

This report documents findings from a comprehensive audit of the Monopoly Multiplayer codebase, covering project mapping, dead code/unused files, duplicate logic, config anomalies, and strict TypeScript/linting improvements.

---

## 1. Project Map & Entry Points

### Entry Points
- **Frontend Entry**: [src/main.tsx](file:///d:/Games/Monopoly-main/Monopoly-main/src/main.tsx) (compiles to `dist/`) loaded by [index.html](file:///d:/Games/Monopoly-main/Monopoly-main/index.html)
- **Backend Entry**: [backend/index.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/index.ts) (compiles to `dist-backend/index.js`)

### Directory Structure & Source Files
```
├── backend/                  # Authoritative Node/Express Server
│   ├── code.ts               # Lobby code generation & hashing
│   ├── config.ts             # Hardcoded server configs (CODE_PREFIX)
│   ├── game.ts               # Authoritative game loop & rules (130 KB)
│   ├── index.ts              # Express server + WebSocket setup
│   ├── monopoly.json         # Master board rules, cards and rent data
│   ├── sockets.ts            # Socket/Server class wrappers for WS
│   └── types.ts              # Backend copy of types/modes
├── src/                      # Vite Frontend React Client
│   ├── Pages/
│   │   ├── Gallery/          # Dead Gallery route/view
│   │   ├── Home/             # Main dashboard (home.tsx) & monopoly gameplay panel (monopoly.tsx - 126 KB)
│   │   └── Users/            # Dead Users/Friends view (mismatched export name 'Gallery')
│   ├── components/
│   │   ├── icons.tsx         # Reusable SVG Icons wrapper
│   │   ├── notificator.tsx   # Dialog/Notification provider
│   │   ├── settingsNav.tsx   # Dashboard Settings component
│   │   ├── ingame/           # Game components (game.tsx - 133 KB, playersTab, insightsTab, etc.)
│   │   ├── menu/             # Lobby join/create screen
│   │   └── utils/            # Shared slider.tsx & switcher.tsx (dead component)
│   ├── data/
│   │   └── monopoly.json     # Copy of board rules, cards, and rents
│   ├── types/
│   │   └── index.ts          # Frontend copy of types
│   ├── utils/
│   │   ├── code.ts           # Duplicate hashing logic
│   │   ├── cookieManager.ts  # Client settings cookies wrapper
│   │   ├── player.ts         # Frontend Player class implementation
│   │   └── sockets.ts        # Reconnection & WebSocket connection wrappers
│   ├── main.tsx              # Router mapping & DOM root injection
│   └── vite-env.d.ts         # Vite client typings
```

---

## 2. Unused Files, Routes, Components, and Exports

### Dead Files & Routes
- **`src/Pages/Gallery/gallery.tsx` & `gallery.css`**: Not accessible from the UI, completely dead route.
- **`src/Pages/Users/users.tsx` & `users.css`**: Completely dead route. Also exports function `Gallery` default, which is a naming error.
- **`src/components/utils/switcher.tsx` & `switcher.css`**: The `Switcher` component is never imported or used.
- **`dist-backend/bot/`**: Accidental check-in of compiled bot server scripts (`bot.js`, `server.js`) with no typescript sources.

### Unused Imports & Exports
- **`src/main.tsx`**: Imports `BrowserRouter as Router`, `Route`, `Routes` from `react-router-dom` but never uses them (uses `RouterProvider` instead).
- **`src/utils/sockets.ts`**:
  - `_idf` and `_onf` parameters in `Server` constructor are defined but never used.
  - `_e` parameter in `ws.onerror` is defined but never used.
  - `_v` and `_f` unused parameters in socket helper classes.
- **`backend/sockets.ts`**:
  - `WSWebSocket` is imported from `ws` but not fully utilized, or duplicates type names.

---

## 3. Duplicate Logic & Configuration Anomalies

| Duplicate Element | File A | File B | Description / Action |
| :--- | :--- | :--- | :--- |
| **`monopoly.json`** | [backend/monopoly.json](file:///d:/Games/Monopoly-main/Monopoly-main/backend/monopoly.json) | [src/data/monopoly.json](file:///d:/Games/Monopoly-main/Monopoly-main/src/data/monopoly.json) | Duplicated JSON board configurations. Action: Move to a unified `src/shared/data/` or import from the same path. |
| **`types`** | [backend/types.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/types.ts) | [src/types/index.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/types/index.ts) | Identical structure definitions, game interfaces, and modes. Action: Move to `shared/types/game.ts`. |
| **`code.ts`** | [backend/code.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/code.ts) | [src/utils/code.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/utils/code.ts) | Same crypto hashing and random string utilities. Action: Move to `shared/utils/code.ts`. |
| **`config.ts`** | [backend/config.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/config.ts) | [src/config.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/config.ts) | Holds duplicate config block `{ CODE_PREFIX: "my_monopoly_game" }`. Action: Unify or pull from central config. |
| **`Player` logic** | [backend/game.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/game.ts#L16-L91) | [src/utils/player.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/utils/player.ts) | Duplicated player properties (`id`, `username`, `balance`, `properties`, etc.) and `to_json` serialization. |
| **`getPlayerColor`** | [backend/game.ts](file:///d:/Games/Monopoly-main/Monopoly-main/backend/game.ts#L224-L241) | [src/utils/player.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/utils/player.ts#L72-L89) | Identical color palette switch tables mapping icons to hex codes. |

---

## 4. Code Quality & Formatting Cleanups

### Commented-out Code Blocks
- `backend/types.ts`: Commented property systems (`// BuyingSystem: "following-order"`, `// BuyingSystem: "everything"`).
- `backend/game.ts`: Large blocks of debug logs, alternative rule definitions, and commented fields.
- `src/Pages/Home/monopoly.tsx`: Contains extensive legacy rendering logic commented out.

### Console Logs
- **Backend**: 4 `console.log` statements in sockets room creation, WebSocket connections, and server launch message.
- **Frontend**: 6 `console.log` statements in reconnection retries, state indicators, and motion generator logs.
- *Action*: Centralize these into a unified logging layer with `LOG_LEVEL` environment checks (`info`, `debug`, `error`).

### Hardcoded Configuration Flags
- **Starting Cash (`$1500`)**: Hardcoded inside `Player` constructor and mode presets.
- **WebSocket Timeout (`5000ms`)** & **Retry Delays (`2000ms`)**: Hardcoded inside `src/utils/sockets.ts`.
- **Server Ports (`3064`)**: Hardcoded in `backend/index.ts`.
- **Board Size (`40` spaces)**: Assumed inline across game loop arithmetic.
- **Room Expiry Time (`5 minutes`)**: Hardcoded in `backend/sockets.ts`.

### Strict Type `any` Flagging
- **`backend/game.ts`**:
  - `propertyByPosition` is `Map<number, any>`
  - `Player.properties` is `Array<any>`
  - `PlayerJSON.properties` is `Array<any>`
  - WS events arguments typed `any`
  - Cards resolved with typings like `(result as any)`
- **`src/utils/player.ts`**:
  - `PlayerJSON.properties` uses `Array<any>`
- **`src/utils/sockets.ts`**:
  - WS handlers take typed parameters `(args: any)`
- *Action*: Introduce strict structures: `PlayerProperty`, `ChanceCard`, `CommunityChestCard`, `WebSocketPayload`, `MonopolyBoardProperty`.
