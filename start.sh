#!/bin/bash
echo "Starting Monopoly Server..."

# Ensure we are in the script's directory
cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install --registry="https://mirror-npm.runflare.com"

echo "Building frontend..."
npm run build

echo "Starting backend server..."
npm start
