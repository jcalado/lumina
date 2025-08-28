-- Fix the hasEmbedding column and index issues
-- Run this after the previous script to clean up any remaining issues

-- First, let's check what indexes exist on the faces table
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'faces';

-- Drop the old problematic index if it exists (it indexes the embedding column directly)
DROP INDEX IF EXISTS "idx_face_has_embedding";

-- Create the new proper index on the hasEmbedding boolean column
CREATE INDEX "idx_face_has_embedding" ON "faces"("hasEmbedding");

-- Verify the column exists and has the right structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'faces' AND column_name = 'hasEmbedding';

-- Update any faces that might have embeddings but hasEmbedding = false
UPDATE "faces" SET "hasEmbedding" = true WHERE "embedding" IS NOT NULL AND "hasEmbedding" = false;
