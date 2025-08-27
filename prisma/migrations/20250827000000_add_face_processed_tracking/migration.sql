-- CreateIndex
-- Add face processing tracking to photos table

-- Add faceProcessedAt field to track when photo faces were last processed
ALTER TABLE `photos` ADD COLUMN `faceProcessedAt` DATETIME(3) NULL;

-- Add index for efficient querying of unprocessed photos
CREATE INDEX `photos_faceProcessedAt_idx` ON `photos`(`faceProcessedAt`);
