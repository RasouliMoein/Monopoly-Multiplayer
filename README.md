# 🎲 Monopoly Multiplayer

**A sleek, modern, server-authoritative Monopoly game built with React 18, Node.js, and TypeScript.**

---

## 🚀 Quick Start

1. **Configure**: Create a `.env` file in the root directory:
   ```env
   PORT=3064
   DEBUG_PASSWORD=monopolyadmin
   CODE_PREFIX=my_monopoly_game
   LOG_LEVEL=info
   ```
   *Shared server/client parameters reside in [index.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/shared/config/index.ts).*

2. **Launch the Application**:
   * **Windows**: Execute [start.bat](file:///d:/Games/Monopoly-main/Monopoly-main/start.bat)
   * **Linux / macOS**: Run `chmod +x start.sh && ./start.sh` (via [start.sh](file:///d:/Games/Monopoly-main/Monopoly-main/start.sh))
   * **Manual Build**: 
     ```bash
     npm install && npm run build && npm run build:backend && npm start
     ```

3. **Access**: Open **[http://localhost:3064](http://localhost:3064)**. You can check backend health at `/api/health`.

> [!NOTE]
> The app serves the React client via the Express server on a single port to eliminate CORS and WebSocket cross-origin blocks.

---

## 🎨 Key Features

* **Server-Authoritative State:** Game logic, turn execution, and rules run securely on the Node.js backend.
* **Resilient Session Reconnection:** Session tokens cached in `sessionStorage` allow players to reconnect and restore state on tab refresh/disconnect.
* **Classic Monopoly Rules:** Enforces property auctions, housing limits (32 houses, 12 hotels) with demotions, trading checks, and bankruptcy asset transfers.
* **Spectator Mode:** Lobbies automatically support seamless real-time viewing for extra players joining an active game.
* **Premium Insights & UI:** Dark glassmorphism theme, custom SVG icons, live asset allocation progress bars, and a live "Luck Index" tracking dice roll distributions.
* **Secured QA Sandbox:** Collapsible debugger panel secured via `DEBUG_PASSWORD` to force dice values, trigger debt states, and mock cash/assets.

---

## 🧪 Development & Quality Assurance

* **Unit & Integration Tests**: Run `npm run test` using Jest to validate player balance logic, rent calculations, game phases, and WebSocket Zod validations.
* **Linting & Type Checking**: Verify code quality and compile checks using `npm run lint` and `npm run type-check`.
* **CI/CD Pipeline**: GitHub Actions configuration at [ci.yml](file:///d:/Games/Monopoly-main/Monopoly-main/.github/workflows/ci.yml) validates every push/PR.

---

## 🎮 Game Controls

* **`[1-9]` Keys:** Switch through active board navigation/property drawers.
* **Mouse Scroll:** Rotate board grid.
* **Shift + Mouse Scroll:** Zoom board in/out.

---

## 📜 Credits & Disclaimers

* **Base Codebase:** Forked from [itaylayzer/Monopoly](https://github.com/itaylayzer/Monopoly). Original schema layout credit to [Daniel Stern](https://github.com/danielstern).
* **Audio:** Main soundtrack and sound effects mixed/mastered using Adobe Audition.
* **Legal:** Monopoly is a registered trademark of Hasbro Inc. This project is a non-commercial, educational study.
