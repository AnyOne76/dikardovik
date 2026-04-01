#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kadrovik}"
APP_NAME="${APP_NAME:-kadrovik-di}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json not found in $APP_DIR"
  exit 1
fi

echo "==> Updating code ($REMOTE/$BRANCH) in $APP_DIR"
git fetch "$REMOTE" "$BRANCH"
git reset --hard "$REMOTE/$BRANCH"

echo "==> Installing dependencies (npm ci)"
npm ci --maxsockets=1

echo "==> Applying database migrations"
npm run db:deploy

echo "==> Building production bundle"
npm run build

echo "==> Restarting PM2 process: $APP_NAME"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.cjs --name "$APP_NAME"
fi

pm2 save

echo "==> Done"
