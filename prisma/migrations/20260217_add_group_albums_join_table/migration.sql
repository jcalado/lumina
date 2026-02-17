-- CreateTable: group_albums join table
CREATE TABLE "group_albums" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,

    CONSTRAINT "group_albums_pkey" PRIMARY KEY ("id")
);

-- Migrate existing data: copy albumId from groups into the join table
INSERT INTO "group_albums" ("id", "groupId", "albumId")
SELECT gen_random_uuid()::text, "id", "albumId"
FROM "groups"
WHERE "albumId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "group_albums_groupId_idx" ON "group_albums"("groupId");
CREATE INDEX "group_albums_albumId_idx" ON "group_albums"("albumId");
CREATE UNIQUE INDEX "group_albums_groupId_albumId_key" ON "group_albums"("groupId", "albumId");

-- AddForeignKeys
ALTER TABLE "group_albums" ADD CONSTRAINT "group_albums_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_albums" ADD CONSTRAINT "group_albums_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old foreign key and column from groups
ALTER TABLE "groups" DROP CONSTRAINT IF EXISTS "groups_albumId_fkey";
ALTER TABLE "groups" DROP COLUMN "albumId";
