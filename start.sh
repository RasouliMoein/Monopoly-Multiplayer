#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "========================================================"
echo "  🎲 Monopoly Multiplayer - Startup Launcher 🎲"
echo "========================================================"
echo ""

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed! Please install it from https://nodejs.org/"
    exit 1
fi

# Check NPM installation
if ! command -v npm &> /dev/null; then
    echo "[ERROR] NPM is not installed!"
    exit 1
fi

# Auto-setup environment config
if [ ! -f .env ]; then
    echo "[INFO] .env file not found. Copying .env.example..."
    cp .env.example .env
    echo "[SUCCESS] Created default .env configuration."
fi

# Use higher V8 heap for builds on low-memory setups
export NODE_OPTIONS="--max-old-space-size=2048"

# Auto-install dependencies
if [ ! -d node_modules ]; then
    echo "[INFO] node_modules not found. Installing dependencies..."
    
    # Try default npm install first
    if npm install; then
        echo "[SUCCESS] Dependencies installed successfully."
    else
        echo "[WARNING] Default installation failed. Attempting to install with the mirror registry..."
        if npm install --registry="https://package-mirror.liara.ir/repository/npm/"; then
            echo "[SUCCESS] Dependencies installed via mirror registry."
        else
            echo "[ERROR] Failed to install dependencies."
            exit 1
        fi
    fi
fi

# Build React Frontend
echo "[INFO] Compiling React Frontend..."
npm run build

# Build Backend and start Server
echo ""
echo "========================================================"
echo "  🚀 Starting Dedicated Monopoly Server..."
echo "  The server will compile the backend and start."
echo "========================================================"
echo ""

npm start

