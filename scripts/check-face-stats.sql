-- Check face statistics in the database
-- Run this on your remote server to see face counts

-- Basic face counts
SELECT
  (SELECT COUNT(*) FROM faces) as total_faces,
  (SELECT COUNT(*) FROM faces WHERE "personId" IS NOT NULL) as assigned_faces,
  (SELECT COUNT(*) FROM faces WHERE "personId" IS NULL) as unassigned_faces,
  (SELECT COUNT(*) FROM faces WHERE ignored = true) as ignored_faces,
  (SELECT COUNT(*) FROM people) as total_people,
  (SELECT COUNT(*) FROM people WHERE confirmed = true) as confirmed_people;

-- Face embedding statistics
SELECT
  (SELECT COUNT(*) FROM faces WHERE "hasEmbedding" = true) as faces_with_embeddings,
  (SELECT COUNT(*) FROM faces WHERE "hasEmbedding" = false) as faces_without_embeddings,
  (SELECT COUNT(*) FROM faces WHERE embedding IS NOT NULL) as faces_with_embedding_data;

-- People with face counts
SELECT
  p.name,
  COUNT(f.id) as face_count,
  p.confirmed,
  p."createdAt"
FROM people p
LEFT JOIN faces f ON f."personId" = p.id
GROUP BY p.id, p.name, p.confirmed, p."createdAt"
ORDER BY face_count DESC
LIMIT 20;

-- Photos with face counts
SELECT
  ph.filename,
  COUNT(f.id) as face_count,
  ph."faceProcessedAt"
FROM photos ph
LEFT JOIN faces f ON f."photoId" = ph.id
GROUP BY ph.id, ph.filename, ph."faceProcessedAt"
HAVING COUNT(f.id) > 0
ORDER BY face_count DESC
LIMIT 20;
