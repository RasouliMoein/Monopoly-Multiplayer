#!/bin/bash
set -e
echo "Starting Monopoly Server..."

# Ensure we are in the script's directory
cd "$(dirname "$0")"

# Use a higher V8 heap on low-memory servers for npm and TypeScript build steps.
export NODE_OPTIONS="--max-old-space-size=2048"

echo "Installing dependencies..."
npm install --registry="https://package-mirror.liara.ir/repository/npm/"

echo "Building frontend..."
npm run build

echo "Starting backend server..."
npm start
