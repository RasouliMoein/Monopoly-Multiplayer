<div align="center">

# 🎲 MONOPOLY MULTIPLAYER

### 🚀 Fully AI-Remastered & Vibe-Coded Edition
**Experience a sleek, modern, server-authoritative Monopoly game built entirely by AI agents.**

[![Frontend - React](https://img.shields.io/badge/Frontend-React%2018-blue?style=for-the-badge&logo=react)](https://react.dev)
[![Backend - Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Language - TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Network - WebSockets](https://img.shields.io/badge/Network-WebSockets-orange?style=for-the-badge&logo=socket.io)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![Tooling - Antigravity IDE](https://img.shields.io/badge/Powered%20By-Antigravity%20IDE-9C27B0?style=for-the-badge)](https://gemini.google.com)
[![AI Coded - Claude 4.6 & Gemini 3.5](https://img.shields.io/badge/AI%20Coded-Claude%204.6%20%7C%20Gemini%203.5-red?style=for-the-badge)](https://gemini.google.com)

---

![Project Banner](./public/banner.png)

</div>

---

> [!IMPORTANT]
> **Autonomous AI-Agent Remaster:** Every single line of custom code, logic, styling, and asset integration added to this repository was built autonomously by AI Agents (Claude 4.6 Sonnet and Gemini 3.5) within the Antigravity IDE.

---

## ⚡ Quick Start

### 1. Configuration
Create a `.env` file in the root directory:
```env
PORT=3064
DEBUG_PASSWORD=monopolyadmin
CODE_PREFIX=my_monopoly_game
LOG_LEVEL=info
```
*Note: Shared client/server config is managed in [index.ts](file:///d:/Games/Monopoly-main/Monopoly-main/src/shared/config/index.ts).*

### 2. Launch the Application
* **Windows (Quick Start)**: Double-click or run [start.bat](file:///d:/Games/Monopoly-main/Monopoly-main/start.bat)
* **Linux / macOS**: Run `chmod +x start.sh && ./start.sh` (via [start.sh](file:///d:/Games/Monopoly-main/Monopoly-main/start.sh))
* **Manual Setup**:
  ```bash
  npm install
  npm run build          # Build React client
  npm run build:backend  # Build backend server
  npm start              # Launch Express
  ```

### 3. Open Game
Navigate to **[http://localhost:3064](http://localhost:3064)**. Check the live server stats at `http://localhost:3064/api/health`.

> [!NOTE]
> The app serves the React client via the Express server on a single port to eliminate CORS and WebSocket cross-origin blocks.

---

## ⚙️ Key Upgraded Systems

| Feature | Description |
| :--- | :--- |
| **📡 Server-Authoritative State** | All gameplay rules, trade evaluations, and transitions execute securely on the Node.js backend to prevent client desync and cheating. |
| **🔄 Session Reconnection** | Automatically restores match state and player connections using cached browser `sessionStorage` tokens upon refresh or disconnect. |
| **🎩 Strict Classic Rules** | Implements interactive auctions, standard housing limits (32 houses, 12 hotels) with demotions, two-way trading panels, and bankruptcy assets liquidation. |
| **👁️ Spectator Mode** | Allows overfill players to seamlessly spectate live games in real-time without altering room state. |
| **📊 Insights & Luck Index** | Displays live asset allocation charts, property progress bars, and computes a "Luck Index" comparing expected vs actual dice distributions. |
| **🛠️ Secured QA Sandbox** | Secured with `DEBUG_PASSWORD`, this collapsible panel lets you test game logic by forcing dice rolls, triggering debt, or adding assets. |

---

## 🧪 Development & Quality Assurance

* **Automated Testing:** Run `npm run test` using Jest to validate player balance logic, rent calculations, game phases, and WebSocket Zod validations.
* **Code Quality:** Enforce syntax guidelines with `npm run lint` and verify TypeScript compiler checks via `npm run type-check`.
* **CI/CD Integration:** A pre-configured GitHub Actions pipeline at [ci.yml](file:///d:/Games/Monopoly-main/Monopoly-main/.github/workflows/ci.yml) validates all pushes and PRs.

---

## 🎮 Controls

* **`[1-9]` Keys:** Switch through active board navigation drawers.
* **Mouse Scroll:** Rotate board grid.
* **Shift + Scroll:** Zoom board in/out.

---

## 📜 Credits & Disclaimers

* **Base Repository:** Forked from [itaylayzer/Monopoly](https://github.com/itaylayzer/Monopoly) with schema layout credit to [Daniel Stern](https://github.com/danielstern).
* **Audio:** Main soundtrack and sound effects mixed/mastered using Adobe Audition.
* **Legal:** Monopoly is a trademark of Hasbro Inc. This project is a non-commercial, open-source educational exercise.
