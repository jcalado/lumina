-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_faces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoId" TEXT NOT NULL,
    "personId" TEXT,
    "boundingBox" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "embedding" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "faces_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "faces_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_faces" ("boundingBox", "confidence", "createdAt", "embedding", "id", "personId", "photoId", "verified") SELECT "boundingBox", "confidence", "createdAt", "embedding", "id", "personId", "photoId", "verified" FROM "faces";
DROP TABLE "faces";
ALTER TABLE "new_faces" RENAME TO "faces";
CREATE INDEX "faces_photoId_idx" ON "faces"("photoId");
CREATE INDEX "faces_personId_idx" ON "faces"("personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
