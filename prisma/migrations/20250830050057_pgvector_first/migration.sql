-- pgvector-first migration (Postgres 17 + pgvector >= 0.5)

-- 1) Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Add embedding_vec to faces (normalized vectors; InsightFace commonly 512-d)
DO $$ BEGIN
  ALTER TABLE "faces" ADD COLUMN IF NOT EXISTS embedding_vec vector(512);
EXCEPTION WHEN undefined_table THEN
  -- Table name may be mapped differently; Prisma maps to "faces" by @@map
  RAISE;
END $$;



CREATE INDEX IF NOT EXISTS person_prototypes_vec_hnsw_idx ON "person_prototypes" USING hnsw (embedding_vec vector_cosine_ops);

-- 4) HNSW indexes for fast KNN on faces
CREATE INDEX IF NOT EXISTS faces_embedding_vec_hnsw_idx ON "faces" USING hnsw (embedding_vec vector_cosine_ops);

-- Optional partial index to speed KNN over unassigned faces
CREATE INDEX IF NOT EXISTS faces_unassigned_embedding_vec_hnsw_idx
  ON "faces" USING hnsw (embedding_vec vector_cosine_ops)
  WHERE "personId" IS NULL AND "hasEmbedding" = true AND "ignored" = false;

-- 5) Analyze to update stats (harmless if empty)
ANALYZE "faces";

