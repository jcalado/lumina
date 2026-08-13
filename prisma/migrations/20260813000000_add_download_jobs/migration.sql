-- CreateTable
CREATE TABLE "download_jobs" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "albumPath" TEXT,
    "photoIds" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "filename" TEXT,
    "filePath" TEXT,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "download_jobs_token_key" ON "download_jobs"("token");

-- CreateIndex
CREATE INDEX "download_jobs_dedupeKey_status_idx" ON "download_jobs"("dedupeKey", "status");

-- CreateIndex
CREATE INDEX "download_jobs_expiresAt_idx" ON "download_jobs"("expiresAt");

