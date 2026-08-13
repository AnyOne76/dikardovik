/**
 * Проверка NEXTAUTH_SECRET: пустая строка и значение из .env.example
 * в проде дают предсказуемые JWT и не должны пропускаться.
 */

export const EXAMPLE_NEXTAUTH_SECRET = "replace_with_long_random_secret";

const MIN_SECRET_LENGTH = 16;

export function isUsableAuthSecret(value: string | undefined | null): boolean {
  const secret = String(value ?? "").trim();
  if (secret.length < MIN_SECRET_LENGTH) return false;
  if (secret === EXAMPLE_NEXTAUTH_SECRET) return false;
  return true;
}

export function assertAuthSecret(value: string | undefined | null = process.env.NEXTAUTH_SECRET): string {
  const secret = String(value ?? "").trim();
  if (!isUsableAuthSecret(secret)) {
    throw new Error(
      "NEXTAUTH_SECRET не задан или совпадает с примером из .env.example. " +
        "Сгенерируйте длинную случайную строку (openssl rand -base64 32) и пропишите её в .env.",
    );
  }
  return secret;
}
