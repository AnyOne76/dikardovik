# DI: Кадровый Навигатор

Веб-приложение для генерации должностных инструкций по фиксированному шаблону с экспортом в DOCX, аутентификацией и историей версий.

- **Документация в приложении:** после деплоя откройте страницу `/readme` — там выводится этот же файл `README.md` из корня проекта (GitHub по-прежнему показывает его только на странице репозитория; это не двусторонняя синхронизация).
- **Стек:** Next.js (App Router), TypeScript, Prisma + SQLite, NextAuth (credentials), Perplexity / OpenRouter.
- **Node.js:** версия 20 и выше.

## Локальный запуск

```bash
cp .env.example .env
# Заполните .env (ключи API, NEXTAUTH_SECRET)

npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Логин и пароль администратора задаются в `.env` (`SEED_ADMIN_LOGIN` / `SEED_ADMIN_PASSWORD`).

**Описание проекта для HR и карта потоков (HTML, печать в PDF):** [http://localhost:3000/di-navigator-guide.html](http://localhost:3000/di-navigator-guide.html) — на проде замените хост на ваш публичный URL, путь тот же: `/di-navigator-guide.html`.

## Тесты и линт

```bash
npm run lint
npm run test
```

## Публикация на GitHub

1. Создайте **новый пустой** репозиторий на GitHub (без README, если уже есть в проекте).
2. В каталоге приложения:

```bash
cd di-web-app
git init
git add .
git commit -m "Initial commit: Kadrovik DI"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git
git push -u origin main
```

Либо из корня проекта в PowerShell (после создания пустого репозитория на GitHub):

```powershell
.\scripts\push-to-github.ps1 -RepoUrl "https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git"
```

При запросе пароля при HTTPS чаще всего нужен **Personal Access Token** (не пароль от аккаунта).

3. **Никогда не коммитьте** файл `.env` и реальные ключи. В репозитории должен быть только `.env.example`.
4. На сервере создайте `.env` вручную или через панель/секреты.

## Деплой на Beget (VPS с Node.js)

Обычный **общий хостинг** без Node часто **не подходит** для Next.js. Нужен **VPS** (или тариф с запуском Node-приложений) и доступ по SSH.

### 1. На сервере

- Установите **Node.js 20+** (через nvm или пакеты ОС).
- Установите **git**.

### 2. Клонирование и окружение

```bash
cd /path/to/app
git clone https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПОЗИТОРИЙ.git .
# или в подпапку и cd в неё

cp .env.example .env
nano .env   # заполните переменные
```

Обязательно на проде:

- `NEXTAUTH_URL` — точный публичный URL (например `https://my-domain.ru`).
- `NEXTAUTH_SECRET` — уникальный длинный секрет.
- `DATABASE_URL` — путь к файлу SQLite **в каталоге с правом записи** для пользователя, от которого запускается приложение (например `file:/var/www/kadrovik/data/app.db`; каталог создайте заранее).

### 3. Сборка и миграции

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run build
```

Скрипт `npm run build` уже вызывает `prisma generate` перед сборкой Next.js.

Важно: на сервере избегайте запуска «голого» `npx prisma ...`, если `node_modules` не установлен (например после `Killed` во время `npm ci`). В таком случае `npx` может подтянуть несовместимую версию Prisma CLI.

### 4. Запуск в продакшене

```bash
NODE_ENV=production npm run start
```

По умолчанию приложение слушает порт **3000**. За обратным прокси (Nginx на Beget) пробрасывайте на этот порт или остановите встроенный сервер и используйте `next start -p 3001` и т.д.

Рекомендуется держать процесс через **PM2** или **systemd**, чтобы приложение перезапускалось после сбоя и перезагрузки сервера.

Пример PM2 (после `npm install -g pm2`):

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Конфиг: `ecosystem.config.cjs` в корне проекта.

### 5. Nginx (кратко)

- Прокси `proxy_pass` на `http://127.0.0.1:3000`.
- Включите заголовки для HTTPS, если используете SSL (Let’s Encrypt в панели Beget).

### 6. Обновление после `git push`

```bash
cd /path/to/app
git pull origin main
chmod +x ./scripts/deploy.sh
./scripts/deploy.sh
```

Если `npm ci` завершается `Killed`, это обычно нехватка RAM. Добавьте swap или увеличьте память VPS.

## Переменные окружения

См. файл `.env.example`. Все секреты задаются только на сервере или в локальном `.env`, не в Git.

## Логотип

Файл `public/myasnitsky-logo.png` можно заменить своим при сохранении имени или с правкой пути в `src/components/AppHeader.tsx`.
