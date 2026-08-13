#!/usr/bin/env node
/**
 * Проверка обязательных переменных перед выкатом.
 * Читает .env из текущей директории, не печатает значения секретов.
 */
const fs = require("node:fs");
const path = require("node:path");

const EXAMPLE_SECRET = "replace_with_long_random_secret";
const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env"));

const errors = [];
const warnings = [];

const secret = String(process.env.NEXTAUTH_SECRET ?? "").trim();
if (!secret || secret === EXAMPLE_SECRET || secret.length < 16) {
  errors.push("NEXTAUTH_SECRET не задан или совпадает с примером из .env.example (openssl rand -base64 32).");
}

const url = String(process.env.NEXTAUTH_URL ?? "").trim();
if (!url) {
  errors.push("NEXTAUTH_URL пуст — укажите точный URL из браузера (с протоколом и портом).");
} else if (!/^https?:\/\//i.test(url)) {
  errors.push("NEXTAUTH_URL должен начинаться с http:// или https://");
}

const adminPassword = String(process.env.SEED_ADMIN_PASSWORD ?? "").trim();
if (process.env.NODE_ENV === "production" && (!adminPassword || adminPassword === DEFAULT_ADMIN_PASSWORD)) {
  errors.push("SEED_ADMIN_PASSWORD на production нельзя оставлять пустым или ChangeMe123!.");
}

const llmKey = String(process.env.OPENROUTER_API_KEY ?? "").trim();
if (!llmKey) {
  warnings.push("OPENROUTER_API_KEY пуст. Генерация ДИ не заработает, пока ключ не зададут в .env или в админке.");
}

const pplxKey = String(process.env.PERPLEXITY_API_KEY ?? "").trim();
if (!pplxKey) {
  warnings.push("PERPLEXITY_API_KEY пуст. Документы будут собираться без добора по ЕКС/ЕТКС.");
}

for (const line of warnings) console.warn("WARN:", line);
for (const line of errors) console.error("ERROR:", line);

if (errors.length) {
  process.exit(1);
}

console.log("OK: базовые переменные окружения заданы.");
