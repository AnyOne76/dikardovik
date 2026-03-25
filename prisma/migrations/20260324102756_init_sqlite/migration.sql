-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'hr',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InstructionVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobTitleId" TEXT NOT NULL,
    "generationRunId" TEXT,
    "version" INTEGER NOT NULL,
    "templateJson" JSONB NOT NULL,
    "finalText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstructionVersion_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstructionVersion_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstructionLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstructionLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobTitle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstructionLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "JobTitle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "jobTitleInput" TEXT NOT NULL,
    "perplexityModel" TEXT,
    "openrouterModel" TEXT,
    "promptVersion" TEXT,
    "status" TEXT NOT NULL,
    "tokenUsage" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_name_key" ON "JobTitle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_normalized_key" ON "JobTitle"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "InstructionVersion_jobTitleId_version_key" ON "InstructionVersion"("jobTitleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InstructionLink_sourceId_targetId_key" ON "InstructionLink"("sourceId", "targetId");
