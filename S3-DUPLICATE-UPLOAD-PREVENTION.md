# S3 Duplicate Upload Prevention Implementation

## Overview

Enhanced the album sync functionality to check if files are already present in the S3-compatible bucket before attempting to upload them. This prevents unnecessary uploads and improves sync performance.

## Changes Made

### 1. Enhanced S3Service (`lib/s3.ts`)

Added a new `objectExists()` method to efficiently check if a file exists in S3:

```typescript
async objectExists(key: string): Promise<boolean>
```

**Features:**
- Uses `HeadObjectCommand` for efficient existence checking (only metadata, no file content)
- Properly handles S3 errors (returns `false` for 404/NoSuchKey, re-throws other errors)
- Follows the same initialization pattern as other S3Service methods

### 2. Enhanced Sync Logic (`app/api/sync/route.ts`)

Modified the `syncAlbumPhotosConcurrent()` function to implement smart upload logic:

#### New Photos Processing
- **Before**: Always uploaded new photos detected in filesystem
- **After**: Checks if the S3 key already exists before uploading
- **Benefit**: Prevents duplicate uploads if the photo was already synced in a previous run

#### Existing Photos Verification
- **Before**: Only updated metadata for existing database records
- **After**: Verifies that existing photos still exist in S3
- **Benefit**: Automatically re-uploads files that were manually deleted from S3 but still exist in the database

#### Batch Processing for Existence Checks
- Processes S3 existence checks in configurable batches (default: 10 concurrent checks)
- Separates photos needing re-upload from those only needing metadata updates
- Maintains performance while being thorough

## Technical Implementation

### Key Logic Flow

1. **Identify Photo Categories**:
   - New photos: Found in filesystem but not in database
   - Existing photos: Found in both filesystem and database
   - Orphaned photos: In database but not in filesystem (deleted)

2. **S3 Existence Verification**:
   - For new photos: Check if S3 key already exists before upload
   - For existing photos: Verify S3 files still exist, mark for re-upload if missing

3. **Smart Upload Decision**:
   - Skip upload if file already exists in S3
   - Upload if file is new or missing from S3
   - Log appropriate messages for each action

### Error Handling

- **S3 Connection Issues**: Re-throws network/auth errors for proper handling
- **Missing Files**: Gracefully handles cases where S3 files are missing
- **Partial Failures**: Continues processing other files if individual checks fail

### Performance Optimizations

- **HeadObject vs GetObject**: Uses lighter HEAD requests for existence checks
- **Batch Processing**: Prevents overwhelming S3 with too many concurrent requests
- **Early Skip**: Avoids reading local files if S3 copy already exists

## Usage

The enhanced sync functionality is automatically used when running album sync operations. No configuration changes are required.

### Sync API Endpoint
```
POST /api/sync
```

### Example Log Output
```
INFO: Processing 15 new photos in batches of 5
INFO: Checking 8 existing photos for S3 presence
INFO: Photo already exists in S3, skipping upload: photo1.jpg
WARN: Existing photo missing from S3, will re-upload: photo2.jpg
INFO: Uploading new photo: photo3.jpg
```

## Benefits

1. **Reduced Upload Time**: Skips files already in S3
2. **Bandwidth Savings**: Prevents unnecessary data transfer
3. **Cost Optimization**: Reduces S3 API calls and storage costs
4. **Reliability**: Automatically recovers from missing S3 files
5. **Idempotent Sync**: Running sync multiple times is safe and efficient

## Testing

Created `scripts/test-s3-existence.ts` to verify the object existence functionality:

```bash
npx tsx scripts/test-s3-existence.ts
```

## Backward Compatibility

- Fully backward compatible with existing sync processes
- No database schema changes required
- No changes to API contracts
- Existing albums and photos continue to work normally

## Error Recovery

The implementation handles various edge cases:

- **S3 Temporarily Unavailable**: Will retry on next sync
- **Partial Uploads**: Re-uploads incomplete files
- **Manual S3 Deletion**: Automatically detects and re-uploads missing files
- **Database Inconsistencies**: Reconciles database state with S3 reality

This implementation makes the sync process more efficient and robust while maintaining full compatibility with existing functionality.
