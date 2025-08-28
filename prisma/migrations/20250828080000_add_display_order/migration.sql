-- Add displayOrder column to albums for custom ordering
ALTER TABLE "albums" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

