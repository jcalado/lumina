-- Add hasEmbedding column to faces table
-- This script adds the missing hasEmbedding column that was added to fix the index issue

-- Add the hasEmbedding column with default value
ALTER TABLE "faces" ADD COLUMN "hasEmbedding" BOOLEAN NOT NULL DEFAULT false;

-- Update existing faces to set hasEmbedding = true where embedding is not null
UPDATE "faces" SET "hasEmbedding" = true WHERE "embedding" IS NOT NULL;

-- Create the index for the hasEmbedding column
CREATE INDEX "idx_face_has_embedding" ON "faces"("hasEmbedding");

-- Drop the old problematic index if it exists
DROP INDEX IF EXISTS "idx_face_has_embedding_old";

COMMIT;
