import { prisma } from "@/lib/prisma";

export const APP_SETTINGS_ID = "default" as const;

export type ResolvedApiConfig = {
  perplexityApiKey: string;
  perplexityModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
};

/**
 * Гарантирует наличие строки настроек (singleton).
 */
export async function ensureAppSettingsRow(): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      perplexityApiKey: "",
      openrouterApiKey: "",
      perplexityModel: "sonar-pro",
      openrouterModel: "openai/gpt-4o-mini",
    },
    update: {},
  });
}

/**
 * Слитые настройки: непустые значения из БД имеют приоритет, иначе process.env.
 */
export async function getResolvedApiConfig(): Promise<ResolvedApiConfig> {
  await ensureAppSettingsRow();
  const row = await prisma.appSettings.findUniqueOrThrow({
    where: { id: APP_SETTINGS_ID },
  });

  const dbPx = row.perplexityApiKey.trim();
  const dbOr = row.openrouterApiKey.trim();
  const dbPxModel = row.perplexityModel.trim();
  const dbOrModel = row.openrouterModel.trim();

  return {
    perplexityApiKey: dbPx || (process.env.PERPLEXITY_API_KEY ?? "").trim(),
    openrouterApiKey: dbOr || (process.env.OPENROUTER_API_KEY ?? "").trim(),
    perplexityModel:
      dbPxModel || process.env.PERPLEXITY_MODEL?.trim() || "sonar-pro",
    openrouterModel:
      dbOrModel || process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini",
  };
}

/**
 * Маска ключа для ответа API (без полного секрета).
 */
export function maskApiKey(secret: string): { configured: boolean; mask: string | null } {
  const t = secret.trim();
  if (!t) return { configured: false, mask: null };
  if (t.length < 4) return { configured: true, mask: "****" };
  return { configured: true, mask: `****${t.slice(-4)}` };
}
