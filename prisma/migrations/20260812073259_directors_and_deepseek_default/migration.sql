-- CreateTable
CREATE TABLE "Director" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legalEntityId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "perplexityApiKey" TEXT NOT NULL DEFAULT '',
    "openrouterApiKey" TEXT NOT NULL DEFAULT '',
    "perplexityModel" TEXT NOT NULL DEFAULT 'sonar-pro',
    "openrouterModel" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("id", "openrouterApiKey", "openrouterModel", "perplexityApiKey", "perplexityModel", "updatedAt") SELECT "id", "openrouterApiKey", "openrouterModel", "perplexityApiKey", "perplexityModel", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Director_legalEntityId_isCurrent_idx" ON "Director"("legalEntityId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Director_legalEntityId_fullName_key" ON "Director"("legalEntityId", "fullName");

-- Переезд с OpenRouter на DeepSeek: в существующих базах в настройках лежит
-- старая модель OpenRouter, которую DeepSeek не понимает. Меняем только если
-- значение осталось прежним умолчанием — осознанно выбранную модель не трогаем.
UPDATE "AppSettings" SET "openrouterModel" = 'deepseek-v4-flash' WHERE "openrouterModel" = 'openai/gpt-4o-mini';
