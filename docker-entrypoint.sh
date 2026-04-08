#!/bin/sh
set -e
mkdir -p /app/data
npx prisma migrate deploy
npm run db:ensure-admin
exec npm run start
