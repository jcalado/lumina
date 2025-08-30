-- Migration to add vector indexes for face recognition performance
-- Run this after deploying the schema changes

-- Option 1: IVFFlat index (good for static datasets, faster build)
-- Adjust 'lists' based on your data size (rule of thumb: sqrt(table_size))
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_face_embedding_ivfflat
ON faces USING ivfflat (embedding::vector(512))
WITH (lists = 100);

-- Option 2: HNSW index (better for dynamic datasets, slower build but faster queries)
-- Uncomment if you prefer HNSW over IVFFlat
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_face_embedding_hnsw
-- ON faces USING hnsw (embedding::vector(512) vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- Add partial index for unassigned faces with embeddings (critical for processing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_face_unassigned_with_embedding
ON faces (confidence DESC)
WHERE "personId" IS NULL
  AND embedding IS NOT NULL
  AND "hasEmbedding" = true
  AND (ignored IS NULL OR ignored = false);

-- Composite index for existing face queries (used in assignment logic)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_face_person_embedding
ON faces ("personId", confidence DESC)
WHERE embedding IS NOT NULL
  AND "hasEmbedding" = true
  AND (ignored IS NULL OR ignored = false);

-- Analyze tables to update statistics
ANALYZE faces;
ANALYZE people;
