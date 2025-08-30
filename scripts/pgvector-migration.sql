-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding_vec to faces (512-d default for InsightFace ArcFace models)
DO $$ BEGIN
  ALTER TABLE faces ADD COLUMN IF NOT EXISTS embedding_vec vector(512);
EXCEPTION WHEN duplicate_column THEN
  -- ignore
END $$;

-- Person prototypes table for better multi-modal representation per person
CREATE TABLE IF NOT EXISTS person_prototypes (
  id TEXT PRIMARY KEY DEFAULT concat('proto_', replace(cast(gen_random_uuid() as text), '-', '')),
  "personId" TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  embedding_vec vector(512) NOT NULL,
  weight REAL DEFAULT 1.0,
  note TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_prototypes_person_idx ON person_prototypes ("personId");
CREATE INDEX IF NOT EXISTS person_prototypes_vec_hnsw_idx ON person_prototypes USING hnsw (embedding_vec vector_cosine_ops);

-- Global HNSW indexes for faces
CREATE INDEX IF NOT EXISTS faces_embedding_vec_hnsw_idx ON faces USING hnsw (embedding_vec vector_cosine_ops);

-- Optional partial HNSW index for unassigned, usable for KNN on unassigned faces
CREATE INDEX IF NOT EXISTS faces_unassigned_embedding_vec_hnsw_idx
  ON faces USING hnsw (embedding_vec vector_cosine_ops)
  WHERE "personId" IS NULL AND "hasEmbedding" = true AND "ignored" = false;

-- Helpful analyze after building indexes
ANALYZE faces;
ANALYZE person_prototypes;

