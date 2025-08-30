-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "public"."Status" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."AdminRole" AS ENUM ('SUPERADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."SyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SYNCED', 'CHANGED');

-- CreateEnum
CREATE TYPE "public"."ThumbnailSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."albums" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "public"."Status" NOT NULL DEFAULT 'PUBLIC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "syncedToS3" BOOLEAN NOT NULL DEFAULT false,
    "localFilesSafeDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "syncFingerprint" TEXT,
    "lastSyncCheck" TIMESTAMP(3),
    "syncStatus" "public"."SyncStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."photos" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "metadata" TEXT,
    "fileSize" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3),
    "blurhash" TEXT,
    "faceProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."videos" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "metadata" TEXT,
    "fileSize" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "codec" TEXT,
    "bitrate" INTEGER,
    "takenAt" TIMESTAMP(3),
    "posterFrame" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."video_thumbnails" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "size" "public"."ThumbnailSize" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "video_thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."thumbnails" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "size" "public"."ThumbnailSize" NOT NULL,
    "s3Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_jobs" (
    "id" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "albumProgress" TEXT,
    "totalAlbums" INTEGER NOT NULL DEFAULT 0,
    "completedAlbums" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errors" TEXT,
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "filesUploaded" INTEGER NOT NULL DEFAULT 0,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blurhash_jobs" (
    "id" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "processedPhotos" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errors" TEXT,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blurhash_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."thumbnail_jobs" (
    "id" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "processedPhotos" INTEGER NOT NULL DEFAULT 0,
    "thumbnailsCreated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errors" TEXT,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thumbnail_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."people" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "centroidEmbedding" TEXT,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."faces" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "personId" TEXT,
    "boundingBox" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "embedding" TEXT,
    "hasEmbedding" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."person_prototypes" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "embedding_vec" vector(512) NOT NULL,
    "weight" DOUBLE PRECISION DEFAULT 1.0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_prototypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."face_recognition_jobs" (
    "id" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "processedPhotos" INTEGER NOT NULL DEFAULT 0,
    "facesDetected" INTEGER NOT NULL DEFAULT 0,
    "facesMatched" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "errors" TEXT,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_recognition_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."site_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "public"."AdminRole" NOT NULL DEFAULT 'ADMIN',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "albums_path_key" ON "public"."albums"("path");

-- CreateIndex
CREATE UNIQUE INDEX "albums_path_slug_key" ON "public"."albums"("path", "slug");

-- CreateIndex
CREATE INDEX "photos_albumId_idx" ON "public"."photos"("albumId");

-- CreateIndex
CREATE INDEX "photos_faceProcessedAt_idx" ON "public"."photos"("faceProcessedAt");

-- CreateIndex
CREATE INDEX "photos_takenAt_idx" ON "public"."photos"("takenAt");

-- CreateIndex
CREATE INDEX "photos_albumId_takenAt_idx" ON "public"."photos"("albumId", "takenAt");

-- CreateIndex
CREATE INDEX "photos_faceProcessedAt_albumId_idx" ON "public"."photos"("faceProcessedAt", "albumId");

-- CreateIndex
CREATE INDEX "videos_albumId_idx" ON "public"."videos"("albumId");

-- CreateIndex
CREATE INDEX "video_thumbnails_videoId_idx" ON "public"."video_thumbnails"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_thumbnails_videoId_size_key" ON "public"."video_thumbnails"("videoId", "size");

-- CreateIndex
CREATE INDEX "thumbnails_photoId_idx" ON "public"."thumbnails"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "thumbnails_photoId_size_key" ON "public"."thumbnails"("photoId", "size");

-- CreateIndex
CREATE INDEX "people_confirmed_idx" ON "public"."people"("confirmed");

-- CreateIndex
CREATE INDEX "people_name_idx" ON "public"."people"("name");

-- CreateIndex
CREATE INDEX "people_confirmed_updatedAt_idx" ON "public"."people"("confirmed", "updatedAt");

-- CreateIndex
CREATE INDEX "faces_photoId_idx" ON "public"."faces"("photoId");

-- CreateIndex
CREATE INDEX "faces_personId_idx" ON "public"."faces"("personId");

-- CreateIndex
CREATE INDEX "faces_personId_confidence_idx" ON "public"."faces"("personId", "confidence");

-- CreateIndex
CREATE INDEX "faces_ignored_personId_idx" ON "public"."faces"("ignored", "personId");

-- CreateIndex
CREATE INDEX "faces_verified_idx" ON "public"."faces"("verified");

-- CreateIndex
CREATE INDEX "faces_confidence_idx" ON "public"."faces"("confidence");

-- CreateIndex
CREATE INDEX "faces_createdAt_idx" ON "public"."faces"("createdAt");

-- CreateIndex
CREATE INDEX "faces_personId_verified_idx" ON "public"."faces"("personId", "verified");

-- CreateIndex
CREATE INDEX "faces_photoId_ignored_idx" ON "public"."faces"("photoId", "ignored");

-- CreateIndex
CREATE INDEX "idx_face_unassigned" ON "public"."faces"("personId");

-- CreateIndex
CREATE INDEX "idx_face_has_embedding" ON "public"."faces"("hasEmbedding");

-- CreateIndex
CREATE INDEX "idx_face_not_ignored" ON "public"."faces"("ignored");

-- CreateIndex
CREATE INDEX "person_prototypes_personId_idx" ON "public"."person_prototypes"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "public"."site_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "public"."admin_users"("email");

-- AddForeignKey
ALTER TABLE "public"."photos" ADD CONSTRAINT "photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "public"."albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."videos" ADD CONSTRAINT "videos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "public"."albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."video_thumbnails" ADD CONSTRAINT "video_thumbnails_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "public"."videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."thumbnails" ADD CONSTRAINT "thumbnails_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."faces" ADD CONSTRAINT "faces_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "public"."photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."faces" ADD CONSTRAINT "faces_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."person_prototypes" ADD CONSTRAINT "person_prototypes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
