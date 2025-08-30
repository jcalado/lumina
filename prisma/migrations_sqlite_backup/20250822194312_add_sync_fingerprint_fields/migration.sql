-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLIC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "syncedToS3" BOOLEAN NOT NULL DEFAULT false,
    "localFilesSafeDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" DATETIME,
    "syncFingerprint" TEXT,
    "lastSyncCheck" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_albums" ("createdAt", "description", "enabled", "id", "lastSyncAt", "localFilesSafeDelete", "name", "path", "slug", "status", "syncedToS3", "updatedAt") SELECT "createdAt", "description", "enabled", "id", "lastSyncAt", "localFilesSafeDelete", "name", "path", "slug", "status", "syncedToS3", "updatedAt" FROM "albums";
DROP TABLE "albums";
ALTER TABLE "new_albums" RENAME TO "albums";
CREATE UNIQUE INDEX "albums_path_key" ON "albums"("path");
CREATE UNIQUE INDEX "albums_path_slug_key" ON "albums"("path", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
