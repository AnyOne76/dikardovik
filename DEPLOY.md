# Выкладка «Кадровик DI» на сервер

Инструкция для программиста. Пользовательская шпаргалка — в `README.md`.

Приложение рассчитано на **один сервер** (SQLite). Это внутренний сервис, не публичный SaaS.

## Что нужно до сборки

Собрать у заказчика и **не коммитить** в git:

| Переменная | Зачем |
|---|---|
| Публичный URL | Точный адрес в браузере, с портом и протоколом. Пример: `http://10.0.5.173:25531` или `https://kadrovik.company.ru` |
| `NEXTAUTH_SECRET` | Длинная случайная строка: `openssl rand -base64 32`. Нельзя оставить пример из `.env.example` — контейнер не стартует |
| `SEED_ADMIN_LOGIN` / `SEED_ADMIN_PASSWORD` | Первый админ. Пароль `ChangeMe123!` на production **запрещён** |
| `OPENROUTER_API_KEY` | Ключ [DeepSeek](https://platform.deepseek.com/). Без него генерация ДИ не работает |
| `PERPLEXITY_API_KEY` | Желательно. Без него документы собираются беднее |
| `REGISTRATION_INVITE_CODE` | Код для регистрации сотрудников. Пусто = регистрация выключена |

Файл `.env.save` в репозиторий **не класть**. Если он попал в старые коммиты — смените invite-код и пароли.

## Рекомендуемый способ: Docker Compose

На сервере: Docker + Docker Compose, открытый порт (по умолчанию **25531**).

```bash
git clone <repo> /var/www/kadrovik
cd /var/www/kadrovik
cp .env.example .env
# заполнить .env (см. таблицу выше)
```

В `.env` обязательно:

```env
DATABASE_URL="file:/app/data/prod.db"
NEXTAUTH_SECRET="<сгенерированный секрет>"
NEXTAUTH_URL="http://IP_ИЛИ_ДОМЕН:25531"
AUTH_TRUST_HOST=true
SEED_ADMIN_LOGIN="hr-admin"
SEED_ADMIN_PASSWORD="<свой пароль>"
OPENROUTER_API_KEY="<ключ DeepSeek>"
OPENROUTER_MODEL="deepseek-v4-flash"
PERPLEXITY_API_KEY="<ключ Perplexity>"
PERPLEXITY_MODEL="sonar-pro"
```

`NEXTAUTH_URL` должен **совпадать** с тем, что люди вводят в браузере (не путать `localhost` и IP).

Проверка окружения:

```bash
npm run check:prod-env
```

Запуск:

```bash
docker compose up -d --build
```

Логи: `docker compose logs -f kadrovik-app`

При старте контейнер сам: проверяет секрет → миграции Prisma → создаёт админа, если его ещё нет → `next start`.

База SQLite лежит в volume `kadrovik-data` (`/app/data/prod.db`). Пересборка образа базу **не стирает**.

### Обновление

```bash
cd /var/www/kadrovik
git pull
docker compose up -d --build
```

### Бэкап

Скопировать файл БД из volume (пока контейнер остановлен или через `docker cp`):

```bash
docker compose stop
docker run --rm -v kadrovik_kadrovik-data:/data -v "$(pwd):/backup" alpine \
  cp /data/prod.db /backup/prod-$(date +%F).db
docker compose start
```

Имя volume уточните: `docker volume ls`.

## Альтернатива: Node + PM2 (без Docker)

Нужны Node.js **20+**, npm, PM2.

```bash
cd /var/www/kadrovik
cp .env.example .env   # заполнить; DATABASE_URL=file:/var/www/kadrovik/data/prod.db
mkdir -p data
npm ci
npm run check:prod-env
npm run db:deploy
npm run db:ensure-admin
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Повторный выкат: `APP_DIR=/var/www/kadrovik bash scripts/deploy.sh`  
(скрипт: `git pull` → `npm ci` → проверка env → миграции → админ → сборка → `pm2 restart`).

Перед PM2 выставьте в `.env` тот же `NEXTAUTH_URL`, что в браузере, и `AUTH_TRUST_HOST=true`, если за прокси/нестандартным портом.

## Первый вход

1. Открыть `NEXTAUTH_URL`.
2. Войти логином/паролем из `SEED_ADMIN_*`.
3. **Админка → Настройки:** проверить ключи DeepSeek и Perplexity (если не задали в `.env`).
4. Сформировать тестовую ДИ (например «главный бухгалтер», юрлицо МПЗ).
5. Скачать DOCX: у МПЗ/ФММР в шапке знак бренда, у Бискар/ИТ Эксперт — без него; в «УТВЕРЖДАЮ» — директор выбранного юрлица.

## Если не стартует

| Симптом | Что проверить |
|---|---|
| Контейнер сразу Exit 1, в логе `NEXTAUTH_SECRET` | Секрет пустой или равен `replace_with_long_random_secret` |
| Отказ создать админа / `ChangeMe123!` | Задайте свой `SEED_ADMIN_PASSWORD` |
| Ошибка входа 400 | `NEXTAUTH_URL` ≠ URL в браузере; включите `AUTH_TRUST_HOST=true` |
| «Не задан API-ключ DeepSeek» | `OPENROUTER_API_KEY` в `.env` или ключ в админке |
| Генерация есть, шапка без логотипа | Нормально для Бискар/ИТ Эксперт. Для МПЗ нужен `public/myasnitsky-logo-v2.png` |
| Нет сети до api.deepseek.com / api.perplexity.ai | Открыть исходящий HTTPS с сервера |

## Чего не делать

- Не выкладывать `.env` и `.env.save` в git.
- Не ставить на serverless/Vercel (SQLite и in-memory rate limit).
- Не поднимать несколько инстансов на одну SQLite без отдельного решения по БД.
