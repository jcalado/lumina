# Blurhash and Infinite Scroll Implementation

This implementation adds two key features to enhance the photo gallery experience:

## Features Implemented

### 1. Blurhash Support
- **Purpose**: Generate blur placeholders for smooth photo loading transitions
- **Database**: Added `blurhash` field to `Photo` model
- **Component**: Updated `PhotoImage` component to display blurhash while loading
- **Worker**: Background processor to generate blurhash for existing photos

### 2. Infinite Scroll
- **Pagination**: Albums now load 32 photos initially (configurable via admin)
- **Auto-load**: More photos load automatically as user scrolls down
- **Performance**: Reduces initial page load time for large albums
- **Admin Control**: Photos per page setting can be adjusted in admin dashboard

### 3. Admin Dashboard Enhancements
- **Gallery Settings**: New section to configure photos per page
- **Blurhash Management**: Interface to start/monitor blurhash processing jobs
- **Progress Tracking**: Real-time progress indication for blurhash generation

## Technical Details

### Database Schema Changes
```sql
-- Added to Photo model
blurhash: String? // BlurHash for loading placeholder

-- New BlurhashJob model for tracking background processing
model BlurhashJob {
  id              String    @id @default(cuid())
  status          JobStatus @default(PENDING)
  progress        Int       @default(0)
  totalPhotos     Int       @default(0)
  processedPhotos Int       @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  errors          String?
  logs            String?
  createdAt       DateTime  @default(now())
}
```

### API Endpoints
- `GET /api/albums/[...path]?page=1&limit=32` - Paginated album data
- `GET /api/admin/blurhash` - Get blurhash job status
- `POST /api/admin/blurhash` - Start blurhash processing

### Scripts
- `npm run worker:blurhash` - Run blurhash processing worker
- `scripts/add-photos-per-page-setting.ts` - Add default pagination setting

## Usage

### Starting Blurhash Processing
1. Go to Admin Dashboard → Settings
2. Scroll to "Blurhash Processing" section
3. Click "Generate Blurhash for All Photos"
4. Monitor progress in real-time

### Configuring Photos Per Page
1. Go to Admin Dashboard → Settings
2. Find "Gallery Configuration" section
3. Set "Photos Per Page" (1-100)
4. Save settings

### For Developers

#### Running Blurhash Worker
```bash
npm run worker:blurhash
```

#### PhotoImage Component Usage
```tsx
<PhotoImage
  photoId={photo.id}
  filename={photo.filename}
  blurhash={photo.blurhash} // Optional: blur placeholder
  size="small"
  className="aspect-square"
/>
```

#### Album Page Features
- Automatic infinite scroll when reaching bottom
- Pagination state management
- Blurhash-enabled photo loading
- Progress indicators for loading states

## Dependencies Added
- `blurhash` - Server-side blurhash generation
- `react-blurhash` - Client-side blurhash rendering

## Performance Considerations
- Blurhash generation processes photos in batches
- S3 downloads are optimized for small thumbnail generation
- Infinite scroll prevents loading large albums all at once
- Intersection Observer API used for efficient scroll detection

## Future Enhancements
- Automatic blurhash generation during photo upload
- Variable grid sizes based on device capabilities
- Preloading next batch of photos for seamless scrolling
- Compressed blurhash storage for better performance
