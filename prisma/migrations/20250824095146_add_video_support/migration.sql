-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "metadata" TEXT,
    "fileSize" INTEGER NOT NULL,
    "duration" REAL,
    "width" INTEGER,
    "height" INTEGER,
    "fps" REAL,
    "codec" TEXT,
    "bitrate" INTEGER,
    "takenAt" DATETIME,
    "posterFrame" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "videos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "video_thumbnails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    CONSTRAINT "video_thumbnails_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "videos_albumId_idx" ON "videos"("albumId");

-- CreateIndex
CREATE INDEX "video_thumbnails_videoId_idx" ON "video_thumbnails"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_thumbnails_videoId_size_key" ON "video_thumbnails"("videoId", "size");
