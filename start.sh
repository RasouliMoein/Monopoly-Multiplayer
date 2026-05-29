#!/bin/bash
echo "Starting Monopoly Server..."

# Ensure we are in the script's directory
cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install

echo "Building frontend..."
npm run build

echo "Starting backend server..."
npm start
