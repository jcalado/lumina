-- MariaDB Optimizations for Lumina Photo Gallery
-- Run these queries after migration to optimize performance

-- Face recognition optimizations (removed in legacy cleanup)

-- Photo and album optimizations
CREATE INDEX IF NOT EXISTS idx_photos_album_taken_at ON photos (albumId, takenAt DESC);
CREATE INDEX IF NOT EXISTS idx_photos_s3key ON photos (s3Key);
CREATE INDEX IF NOT EXISTS idx_albums_status_enabled ON albums (status, enabled);
CREATE INDEX IF NOT EXISTS idx_albums_sync_status ON albums (syncStatus);

-- Thumbnail optimizations
CREATE INDEX IF NOT EXISTS idx_thumbnails_photo_size ON thumbnails (photoId, size);
CREATE INDEX IF NOT EXISTS idx_video_thumbnails_video_size ON video_thumbnails (videoId, size);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created ON sync_jobs (status, createdAt DESC);
-- Legacy face recognition jobs removed

-- Settings optimization
CREATE INDEX IF NOT EXISTS idx_site_settings_key ON site_settings (key);

-- MariaDB specific: Enable query cache for read-heavy operations
SET GLOBAL query_cache_type = ON;
SET GLOBAL query_cache_size = 268435456; -- 256MB

-- Legacy face embedding storage removed

-- InnoDB optimizations for large datasets
SET GLOBAL innodb_buffer_pool_size = 1073741824; -- 1GB (adjust based on available RAM)
SET GLOBAL innodb_log_file_size = 268435456; -- 256MB
SET GLOBAL innodb_flush_log_at_trx_commit = 2; -- Better performance for non-critical data

-- Connection optimizations
SET GLOBAL max_connections = 200;
SET GLOBAL wait_timeout = 600;
SET GLOBAL interactive_timeout = 600;
