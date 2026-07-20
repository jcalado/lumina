-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "DropboxFileStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "dropboxes" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destinationAlbumId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "passphraseHash" TEXT,
    "maxUploads" INTEGER,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "maxFilesPerSubmission" INTEGER NOT NULL DEFAULT 50,
    "maxFileSizeBytes" INTEGER NOT NULL DEFAULT 52428800,
    "allowVideos" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dropboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropbox_submissions" (
    "id" TEXT NOT NULL,
    "dropboxId" TEXT NOT NULL,
    "uploaderName" TEXT,
    "uploaderEmail" TEXT,
    "message" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dropbox_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropbox_files" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "DropboxFileStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "promotedPhotoId" TEXT,
    "promotedVideoId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dropbox_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dropboxes_token_key" ON "dropboxes"("token");

-- CreateIndex
CREATE INDEX "dropboxes_token_idx" ON "dropboxes"("token");

-- CreateIndex
CREATE INDEX "dropbox_submissions_dropboxId_createdAt_idx" ON "dropbox_submissions"("dropboxId", "createdAt");

-- CreateIndex
CREATE INDEX "dropbox_files_submissionId_idx" ON "dropbox_files"("submissionId");

-- CreateIndex
CREATE INDEX "dropbox_files_status_idx" ON "dropbox_files"("status");

-- AddForeignKey
ALTER TABLE "dropboxes" ADD CONSTRAINT "dropboxes_destinationAlbumId_fkey" FOREIGN KEY ("destinationAlbumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropboxes" ADD CONSTRAINT "dropboxes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropbox_submissions" ADD CONSTRAINT "dropbox_submissions_dropboxId_fkey" FOREIGN KEY ("dropboxId") REFERENCES "dropboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropbox_files" ADD CONSTRAINT "dropbox_files_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "dropbox_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

