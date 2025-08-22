import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface AlbumFingerprint {
  /** Number of photos in the album */
  photoCount: number;
  /** Hash of concatenated file hashes and sizes */
  contentHash: string;
  /** Total size of all photos in bytes */
  totalSize: number;
  /** Timestamp when fingerprint was generated */
  timestamp: number;
  /** Album metadata hash (name, description) */
  metadataHash: string;
}

/**
 * Generate a fingerprint for an album based on its content and metadata
 */
export async function generateAlbumFingerprint(
  albumPath: string,
  metadata: { name: string; description?: string }
): Promise<AlbumFingerprint> {
  try {
    // Get all image files in the album directory
    const files = await fs.readdir(albumPath);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'].includes(ext);
    });

    let totalSize = 0;
    const fileHashes: string[] = [];

    // Process each image file
    for (const file of imageFiles) {
      const filePath = path.join(albumPath, file);
      try {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        
        // Create a hash combining filename, size, and mtime for efficiency
        const fileInfo = `${file}:${stats.size}:${stats.mtime.getTime()}`;
        const fileHash = crypto.createHash('sha256').update(fileInfo).digest('hex');
        fileHashes.push(fileHash);
      } catch (error) {
        console.warn(`Failed to process file ${filePath}:`, error);
        // Skip files that can't be processed
      }
    }

    // Sort file hashes for consistent fingerprint regardless of filesystem order
    fileHashes.sort();

    // Create content hash from all file hashes
    const contentHash = crypto
      .createHash('sha256')
      .update(fileHashes.join(':'))
      .digest('hex');

    // Create metadata hash
    const metadataString = `${metadata.name}:${metadata.description || ''}`;
    const metadataHash = crypto
      .createHash('sha256')
      .update(metadataString)
      .digest('hex');

    return {
      photoCount: imageFiles.length,
      contentHash,
      totalSize,
      timestamp: Date.now(),
      metadataHash
    };
  } catch (error) {
    console.error(`Failed to generate fingerprint for album ${albumPath}:`, error);
    throw error;
  }
}

/**
 * Compare two fingerprints to determine if an album has changed
 */
export function compareFingerprints(
  current: AlbumFingerprint,
  previous: AlbumFingerprint | null
): { hasChanged: boolean; reason?: string } {
  if (!previous) {
    return { hasChanged: true, reason: 'No previous fingerprint' };
  }

  if (current.photoCount !== previous.photoCount) {
    return { hasChanged: true, reason: 'Photo count changed' };
  }

  if (current.contentHash !== previous.contentHash) {
    return { hasChanged: true, reason: 'Content changed' };
  }

  if (current.totalSize !== previous.totalSize) {
    return { hasChanged: true, reason: 'Total size changed' };
  }

  if (current.metadataHash !== previous.metadataHash) {
    return { hasChanged: true, reason: 'Metadata changed' };
  }

  return { hasChanged: false };
}

/**
 * Parse a fingerprint from its JSON string representation
 */
export function parseFingerprintString(fingerprintStr: string | null): AlbumFingerprint | null {
  if (!fingerprintStr) return null;
  
  try {
    return JSON.parse(fingerprintStr) as AlbumFingerprint;
  } catch (error) {
    console.warn('Failed to parse fingerprint string:', error);
    return null;
  }
}

/**
 * Convert a fingerprint to its JSON string representation
 */
export function stringifyFingerprint(fingerprint: AlbumFingerprint): string {
  return JSON.stringify(fingerprint);
}

/**
 * Check if an album needs syncing based on fingerprints and sync check interval
 */
export function shouldSkipSync(
  album: {
    syncFingerprint: string | null;
    lastSyncCheck: Date | null;
    syncStatus: string;
  },
  currentFingerprint: AlbumFingerprint,
  minCheckIntervalHours: number = 1
): { shouldSkip: boolean; reason?: string } {
  // Always sync if never checked or marked as changed
  if (!album.lastSyncCheck || album.syncStatus === 'CHANGED') {
    return { shouldSkip: false, reason: 'Never checked or marked as changed' };
  }

  // Check if enough time has passed for recheck
  const hoursSinceLastCheck = (Date.now() - album.lastSyncCheck.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastCheck < minCheckIntervalHours) {
    return { shouldSkip: true, reason: `Recent check (${hoursSinceLastCheck.toFixed(1)}h ago)` };
  }

  // Compare fingerprints
  const previousFingerprint = parseFingerprintString(album.syncFingerprint);
  const comparison = compareFingerprints(currentFingerprint, previousFingerprint);
  
  if (!comparison.hasChanged) {
    return { shouldSkip: true, reason: 'No changes detected' };
  }

  return { shouldSkip: false, reason: comparison.reason };
}
