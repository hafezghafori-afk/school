#!/usr/bin/env bash
# Re-deploy script — run this ON THE SERVER (inside the repo directory) every
# time you want to pull the latest code from GitHub and restart the app.
#
#   cd ~/school && ./deploy/deploy.sh
#
set -euo pipefail

echo "==> Pulling latest code from origin/main"
git fetch origin main
git reset --hard origin/main

echo "==> Installing backend dependencies"
cd backend
npm ci --omit=dev
cd ..

echo "==> Building frontend"
cd frontend
npm ci
npm run build
cd ..

echo "==> Restarting app with PM2"
pm2 startOrRestart deploy/ecosystem.config.js
pm2 save

echo "==> Done. Check status with: pm2 status"
