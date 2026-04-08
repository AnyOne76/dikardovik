-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "perplexityApiKey" TEXT NOT NULL DEFAULT '',
    "openrouterApiKey" TEXT NOT NULL DEFAULT '',
    "perplexityModel" TEXT NOT NULL DEFAULT 'sonar-pro',
    "openrouterModel" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AppSettings" ("id", "perplexityApiKey", "openrouterApiKey", "perplexityModel", "openrouterModel", "updatedAt")
VALUES ('default', '', '', 'sonar-pro', 'openai/gpt-4o-mini', CURRENT_TIMESTAMP);
