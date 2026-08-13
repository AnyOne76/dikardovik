#!/bin/sh
set -e
mkdir -p /app/data

secret="$(printf '%s' "${NEXTAUTH_SECRET:-}" | tr -d '[:space:]')"
if [ -z "$secret" ] || [ "$secret" = "replace_with_long_random_secret" ] || [ "${#secret}" -lt 16 ]; then
  echo "NEXTAUTH_SECRET не задан или совпадает с примером из .env.example." >&2
  echo "Сгенерируйте длинную случайную строку (openssl rand -base64 32) и пропишите её в .env." >&2
  exit 1
fi

npx prisma migrate deploy
npm run db:ensure-admin
exec npm run start
